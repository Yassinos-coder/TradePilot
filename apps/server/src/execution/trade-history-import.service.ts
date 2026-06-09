import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  AnalyticsSummaryDTO,
  TradeExecutionDTO,
  TradeHistoryFileDTO,
  tradeHistoryFileDtoSchema,
} from '@tradepilot/shared';

import { DatabaseService } from '../database/database.service';
import { TradeExecutionRecord, TradeHistoryFileRecord } from '../database/database.types';

export interface UploadedTradeHistoryFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export type ParsedImportedTrade = Pick<
  TradeExecutionRecord,
  | 'ticket'
  | 'symbol'
  | 'type'
  | 'volume'
  | 'entry_price'
  | 'exit_price'
  | 'stop_loss'
  | 'take_profit'
  | 'profit'
  | 'status'
  | 'opening_order_type'
  | 'position_direction'
  | 'close_reason'
  | 'comment'
  | 'opened_at'
  | 'closed_at'
>;

export interface ParseTradeHistoryResult {
  platform: 'MT4' | 'MT5' | 'GENERIC';
  trades: ParsedImportedTrade[];
  skippedRows: number;
}

const TRADE_HISTORY_BUCKET = 'tradepilot-history-imports';
const UPLOAD_ACCOUNT_PREFIX = 'upload:';
const SUPPORTED_EXTENSIONS = ['csv', 'txt', 'html', 'htm'];

@Injectable()
export class TradeHistoryImportService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly configService: ConfigService,
  ) {}

  isUploadedHistoryAccount(accountId?: string): boolean {
    return Boolean(accountId?.startsWith(UPLOAD_ACCOUNT_PREFIX));
  }

  sourceAccountId(fileId: string): string {
    return `${UPLOAD_ACCOUNT_PREFIX}${fileId}`;
  }

  uploadedFileIdFromAccount(accountId?: string): string | null {
    if (!this.isUploadedHistoryAccount(accountId)) {
      return null;
    }

    return accountId!.slice(UPLOAD_ACCOUNT_PREFIX.length) || null;
  }

  parse(content: string, filename: string): ParseTradeHistoryResult {
    const extension = filename.split('.').pop()?.toLowerCase() ?? '';
    if (!SUPPORTED_EXTENSIONS.includes(extension)) {
      throw new BadRequestException('Unsupported file type. Upload CSV, TXT, HTML, or HTM files.');
    }

    const rows = extension === 'html' || extension === 'htm' || /<table[\s>]/i.test(content)
      ? this.parseHtmlRows(content)
      : this.parseDelimitedRows(content);

    let skippedRows = 0;
    const trades: ParsedImportedTrade[] = [];
    const platform = this.detectPlatform(rows);

    for (const row of rows) {
      const trade = this.rowToTrade(row, trades.length + 1);
      if (trade) {
        trades.push(trade);
      } else {
        skippedRows += 1;
      }
    }

    if (trades.length === 0) {
      throw new BadRequestException('No closed buy/sell trades were found in the uploaded history file.');
    }

    return { platform, trades, skippedRows };
  }

  async listFiles(userId: string): Promise<TradeHistoryFileDTO[]> {
    const { data, error } = await this.databaseService
      .getClient()
      .from('trade_history_files')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return ((data ?? []) as TradeHistoryFileRecord[]).map((record) => this.toFileDto(record));
  }

  async uploadFile(userId: string, file: UploadedTradeHistoryFile): Promise<TradeHistoryFileDTO> {
    if (!file) {
      throw new BadRequestException('A history file is required.');
    }

    const filename = file.originalname || 'trade-history.txt';
    const content = file.buffer.toString('utf8').replace(/^\uFEFF/, '');
    const parsed = this.parse(content, filename);
    const bucket = this.configService.get<string>('TRADE_HISTORY_STORAGE_BUCKET') ?? TRADE_HISTORY_BUCKET;
    const fileId = randomUUID();
    const safeName = filename.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 120) || 'history.txt';
    const storagePath = `${userId}/${fileId}/${safeName}`;

    await this.ensureBucket(bucket);

    const { error: uploadError } = await this.databaseService
      .getClient()
      .storage
      .from(bucket)
      .upload(storagePath, file.buffer, {
        contentType: file.mimetype || this.contentTypeFor(filename),
        upsert: false,
      });

    if (uploadError) {
      throw new InternalServerErrorException(uploadError.message);
    }

    const displayName = filename.replace(/\.[^.]+$/, '') || filename;
    const { data: fileRecord, error: fileError } = await this.databaseService
      .getClient()
      .from('trade_history_files')
      .insert({
        id: fileId,
        user_id: userId,
        display_name: displayName,
        original_filename: filename,
        storage_bucket: bucket,
        storage_path: storagePath,
        content_type: file.mimetype || this.contentTypeFor(filename),
        file_size: file.size ?? file.buffer.length,
        platform: parsed.platform,
        parsed_trade_count: parsed.trades.length,
        skipped_row_count: parsed.skippedRows,
        status: 'PARSED',
      })
      .select('*')
      .single();

    if (fileError || !fileRecord) {
      await this.databaseService.getClient().storage.from(bucket).remove([storagePath]);
      throw new InternalServerErrorException(fileError?.message ?? 'Failed to save history file metadata');
    }

    const now = new Date().toISOString();
    const accountId = this.sourceAccountId(fileId);
    const executionRows = parsed.trades.map((trade) => ({
      ...trade,
      user_id: userId,
      signal_id: null,
      account_id: accountId,
      account_name: displayName,
      created_at: now,
      updated_at: now,
    }));

    const { error: tradesError } = await this.databaseService
      .getClient()
      .from('trade_executions')
      .upsert(executionRows, { onConflict: 'user_id,account_id,ticket' });

    if (tradesError) {
      await this.deleteUploadedArtifacts(bucket, storagePath, fileId, userId);
      throw new InternalServerErrorException(tradesError.message);
    }

    return this.toFileDto(fileRecord as TradeHistoryFileRecord);
  }

  async deleteFile(userId: string, fileId: string): Promise<void> {
    const { data, error } = await this.databaseService
      .getClient()
      .from('trade_history_files')
      .select('*')
      .eq('id', fileId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    if (!data) {
      throw new NotFoundException('Imported history file not found');
    }

    const record = data as TradeHistoryFileRecord;
    await this.deleteUploadedArtifacts(record.storage_bucket, record.storage_path, fileId, userId);
  }

  async getImportedAnalytics(
    userId: string,
    accountId: string,
    executionService: {
      getAnalytics(userId: string, accountId?: string): Promise<AnalyticsSummaryDTO>;
    },
  ) {
    const fileId = this.uploadedFileIdFromAccount(accountId);
    if (!fileId) {
      return executionService.getAnalytics(userId, accountId);
    }

    await this.assertFileOwner(userId, fileId);
    return executionService.getAnalytics(userId, accountId);
  }

  async assertFileOwner(userId: string, fileId: string): Promise<void> {
    const { data, error } = await this.databaseService
      .getClient()
      .from('trade_history_files')
      .select('id')
      .eq('id', fileId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    if (!data) {
      throw new NotFoundException('Imported history file not found');
    }
  }

  private async deleteUploadedArtifacts(
    bucket: string,
    storagePath: string,
    fileId: string,
    userId: string,
  ) {
    const accountId = this.sourceAccountId(fileId);
    const client = this.databaseService.getClient();

    const { error: tradesError } = await client
      .from('trade_executions')
      .delete()
      .eq('user_id', userId)
      .eq('account_id', accountId);

    if (tradesError) {
      throw new InternalServerErrorException(tradesError.message);
    }

    const { error: fileError } = await client
      .from('trade_history_files')
      .delete()
      .eq('id', fileId)
      .eq('user_id', userId);

    if (fileError) {
      throw new InternalServerErrorException(fileError.message);
    }

    const { error: storageError } = await client.storage.from(bucket).remove([storagePath]);
    if (storageError) {
      throw new InternalServerErrorException(storageError.message);
    }
  }

  private async ensureBucket(bucket: string) {
    const storage = this.databaseService.getClient().storage;
    const { data } = await storage.getBucket(bucket);
    if (data) {
      return;
    }

    const { error } = await storage.createBucket(bucket, {
      public: false,
      fileSizeLimit: 10 * 1024 * 1024,
    });

    if (error && !/already exists/i.test(error.message)) {
      throw new InternalServerErrorException(error.message);
    }
  }

  private toFileDto(record: TradeHistoryFileRecord): TradeHistoryFileDTO {
    return tradeHistoryFileDtoSchema.parse({
      id: record.id,
      displayName: record.display_name,
      originalFilename: record.original_filename,
      storageBucket: record.storage_bucket,
      storagePath: record.storage_path,
      contentType: record.content_type,
      fileSize: Number(record.file_size ?? 0),
      platform: record.platform,
      parsedTradeCount: record.parsed_trade_count,
      skippedRowCount: record.skipped_row_count,
      status: record.status,
      accountId: this.sourceAccountId(record.id),
      createdAt: record.created_at,
      updatedAt: record.updated_at,
    });
  }

  private contentTypeFor(filename: string): string {
    const extension = filename.split('.').pop()?.toLowerCase();
    if (extension === 'html' || extension === 'htm') return 'text/html';
    if (extension === 'csv') return 'text/csv';
    return 'text/plain';
  }

  private detectPlatform(rows: Array<Record<string, string>>): 'MT4' | 'MT5' | 'GENERIC' {
    const headers = new Set(rows.flatMap((row) => Object.keys(row).map((key) => this.normalizeHeader(key))));
    if (headers.has('deal') || headers.has('direction') || headers.has('positionid') || headers.has('fee')) {
      return 'MT5';
    }
    if (headers.has('order') && headers.has('item') && headers.has('closetime')) {
      return 'MT4';
    }
    return 'GENERIC';
  }

  private parseDelimitedRows(content: string): Array<Record<string, string>> {
    const lines = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length < 2) {
      return [];
    }

    const delimiter = this.detectDelimiter(lines.slice(0, 5));
    const headerLineIndex = lines.findIndex((line) => {
      const normalized = this.parseDelimitedLine(line, delimiter).map((cell) => this.normalizeHeader(cell));
      return normalized.some((cell) => ['ticket', 'order', 'deal'].includes(cell)) &&
        normalized.some((cell) => ['symbol', 'item'].includes(cell));
    });
    const headerIndex = headerLineIndex >= 0 ? headerLineIndex : 0;
    const headerLine = lines[headerIndex];
    if (!headerLine) {
      return [];
    }
    const headers = this.parseDelimitedLine(headerLine, delimiter);

    return lines.slice(headerIndex + 1).map((line) => {
      const cells = this.parseDelimitedLine(line, delimiter);
      return this.rowFromHeaders(headers, cells);
    });
  }

  private parseHtmlRows(content: string): Array<Record<string, string>> {
    const tableMatches = [...content.matchAll(/<table[\s\S]*?<\/table>/gi)].map((match) => match[0]);
    const tables = tableMatches.length > 0 ? tableMatches : [content];

    for (const table of tables) {
      const rowMatches = [...table.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((match) => match[0]);
      const rows = rowMatches.map((row) =>
        [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => this.cleanHtml(cell[1] ?? '')),
      ).filter((cells) => cells.length > 0);

      const headerIndex = rows.findIndex((cells) => {
        const normalized = cells.map((cell) => this.normalizeHeader(cell));
        return normalized.some((cell) => ['ticket', 'order', 'deal'].includes(cell)) &&
          normalized.some((cell) => ['symbol', 'item'].includes(cell));
      });

      if (headerIndex >= 0) {
        const headerRow = rows[headerIndex]!;
        const headers = this.disambiguateDuplicateHeaders(headerRow);
        return rows.slice(headerIndex + 1).map((cells) => this.rowFromHeaders(headers, cells));
      }
    }

    return [];
  }

  private cleanHtml(value: string): string {
    return value
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private detectDelimiter(lines: string[]): string {
    const delimiters = ['\t', ';', ',', '|'];
    return delimiters
      .map((delimiter) => ({ delimiter, score: lines.reduce((sum, line) => sum + this.parseDelimitedLine(line, delimiter).length, 0) }))
      .sort((a, b) => b.score - a.score)[0]?.delimiter ?? ',';
  }

  private parseDelimitedLine(line: string, delimiter: string): string[] {
    const cells: string[] = [];
    let current = '';
    let quoted = false;

    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      if (char === '"') {
        if (quoted && line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          quoted = !quoted;
        }
      } else if (char === delimiter && !quoted) {
        cells.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    cells.push(current.trim());
    return cells;
  }

  private rowFromHeaders(headers: string[], cells: string[]): Record<string, string> {
    const disambiguated = this.disambiguateDuplicateHeaders(headers);
    return disambiguated.reduce<Record<string, string>>((row, header, index) => {
      row[header] = cells[index] ?? '';
      return row;
    }, {});
  }

  private disambiguateDuplicateHeaders(headers: string[]): string[] {
    const counts = new Map<string, number>();
    return headers.map((header) => {
      const normalized = header.trim();
      const key = this.normalizeHeader(normalized);
      const count = counts.get(key) ?? 0;
      counts.set(key, count + 1);
      if (key === 'price' && count === 0) return 'Open Price';
      if (key === 'price' && count === 1) return 'Close Price';
      if (key === 'time' && count === 0) return 'Open Time';
      if (key === 'time' && count === 1) return 'Close Time';
      return count > 0 ? `${normalized} ${count + 1}` : normalized;
    });
  }

  private rowToTrade(row: Record<string, string>, index: number): ParsedImportedTrade | null {
    const typeValue = this.lookup(row, ['type', 'side', 'trade type', 'action']);
    const type = /sell|short/i.test(typeValue) ? 'SELL' : /buy|long/i.test(typeValue) ? 'BUY' : null;
    if (!type) {
      return null;
    }

    const symbol = this.lookup(row, ['symbol', 'item', 'instrument']).toUpperCase();
    const openedAt = this.parseDate(this.lookup(row, ['open time', 'entry time', 'time']));
    const closedAt = this.parseDate(this.lookup(row, ['close time', 'exit time', 'time 2']));
    const ticket = this.lookup(row, ['ticket', 'order', 'deal', 'position id', 'trade #']) || `row-${index}`;
    const volume = this.parseNumber(this.lookup(row, ['size', 'lots', 'volume', 'quantity', 'contracts'])) ?? 0;
    const entryPrice = this.parseNumber(this.lookup(row, ['open price', 'entry price', 'price'])) ??
      this.parseNumber(this.lookup(row, ['price 1'])) ?? 0;
    const exitPrice = this.parseNumber(this.lookup(row, ['close price', 'exit price', 'price 2'])) ?? null;
    const profit = this.parseNumber(this.lookup(row, ['net profit', 'profit', 'p/l', 'pnl'])) ?? 0;

    if (!symbol || !openedAt || !closedAt || volume <= 0 || entryPrice <= 0) {
      return null;
    }

    return {
      ticket,
      symbol,
      type,
      volume,
      entry_price: entryPrice,
      exit_price: exitPrice,
      stop_loss: this.parseNumber(this.lookup(row, ['s / l', 'sl', 's/l', 'stop loss'])),
      take_profit: this.parseNumber(this.lookup(row, ['t / p', 'tp', 't/p', 'take profit'])),
      profit,
      status: 'CLOSED',
      opening_order_type: type,
      position_direction: type === 'BUY' ? 'LONG' : 'SHORT',
      close_reason: 'UNKNOWN',
      comment: this.lookup(row, ['comment', 'label']) || null,
      opened_at: openedAt,
      closed_at: closedAt,
    };
  }

  private lookup(row: Record<string, string>, aliases: string[]): string {
    const entries = Object.entries(row);
    for (const alias of aliases) {
      const normalizedAlias = this.normalizeHeader(alias);
      const match = entries.find(([key]) => this.normalizeHeader(key) === normalizedAlias);
      if (match?.[1]) {
        return match[1].trim();
      }
    }

    return '';
  }

  private normalizeHeader(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  private parseNumber(value: string): number | null {
    if (!value) return null;
    const cleaned = value.replace(/\s/g, '').replace(/[^0-9,.-]/g, '');
    if (!cleaned) return null;
    const comma = cleaned.lastIndexOf(',');
    const dot = cleaned.lastIndexOf('.');
    let normalized = cleaned;

    if (comma > dot) {
      normalized = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = cleaned.replace(/,/g, '');
    }

    const number = Number(normalized);
    return Number.isFinite(number) ? number : null;
  }

  private parseDate(value: string): string | null {
    if (!value) return null;
    const trimmed = value.trim();
    const iso = Date.parse(trimmed);
    if (!Number.isNaN(iso)) {
      return new Date(iso).toISOString();
    }

    const asNumber = (match: RegExpMatchArray, index: number, fallback = 0) =>
      Number(match[index] ?? fallback);
    const patterns: Array<[RegExp, (m: RegExpMatchArray) => Date]> = [
      [
        /^(\d{4})\.(\d{2})\.(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/,
        (m) => new Date(Date.UTC(asNumber(m, 1), asNumber(m, 2) - 1, asNumber(m, 3), asNumber(m, 4), asNumber(m, 5), asNumber(m, 6))),
      ],
      [
        /^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/,
        (m) => new Date(Date.UTC(asNumber(m, 3), asNumber(m, 2) - 1, asNumber(m, 1), asNumber(m, 4), asNumber(m, 5), asNumber(m, 6))),
      ],
      [
        /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/,
        (m) => new Date(Date.UTC(asNumber(m, 3), asNumber(m, 2) - 1, asNumber(m, 1), asNumber(m, 4), asNumber(m, 5), asNumber(m, 6))),
      ],
    ];

    for (const [regex, factory] of patterns) {
      const match = trimmed.match(regex);
      if (match) {
        return factory(match).toISOString();
      }
    }

    return null;
  }
}
