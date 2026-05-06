import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { z } from 'zod';

import { SIGNAL_INGESTION_QUEUE } from '@tradepilot/config';
import {
  SignalClassification,
  SignalHistoryFilter,
  SignalIngestionSource,
  SignalRecordDTO,
  softDeleteSignalsSchema,
  signalDtoSchema,
  signalHistoryFilterSchema,
  signalRecordSchema,
} from '@tradepilot/shared';

import { hashText, normalizeRawMessage } from '../common/utils/hash';
import { DatabaseService } from '../database/database.service';
import { SignalRecord } from '../database/database.types';
import { ExecutionService } from '../execution/execution.service';

import { classifySignalMessage } from './signal-classifier';
import { SignalIngestionJob } from './signal.types';

interface IngestSignalInput {
  userId: string;
  rawMessage: string;
  sourceChannel?: string | null;
  telegramMessageId?: string | null;
  telegramChannelId?: string | null;
  messageTimestamp?: string | null;
  ingestionSource?: SignalIngestionSource;
}

@Injectable()
export class SignalsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SignalsService.name);
  private recoveryTimer?: NodeJS.Timeout;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly executionService: ExecutionService,
    @InjectQueue(SIGNAL_INGESTION_QUEUE) private readonly signalQueue: Queue<SignalIngestionJob>,
  ) {}

  onModuleInit() {
    this.recoveryTimer = setInterval(() => {
      void this.requeuePendingSignals();
    }, 15_000);
    this.recoveryTimer.unref?.();
  }

  onModuleDestroy() {
    if (this.recoveryTimer) {
      clearInterval(this.recoveryTimer);
    }
  }

  async ingestRawSignal(
    userId: string,
    rawMessage: string,
    sourceChannel?: string,
  ): Promise<SignalRecordDTO> {
    const { record } = await this.ingestSignalRecord({
      userId,
      rawMessage,
      sourceChannel,
      ingestionSource: 'MANUAL',
    });

    return this.toSignalRecordDto(record);
  }

  async ingestTelegramMessage(input: IngestSignalInput): Promise<SignalRecordDTO> {
    const { record } = await this.ingestSignalRecord({
      ...input,
      ingestionSource: input.ingestionSource ?? 'TELEGRAM_REALTIME',
    });

    return this.toSignalRecordDto(record);
  }

  async listRecentSignals(
    userId: string,
    limit = 10,
    filter: SignalHistoryFilter = 'ALL',
    includeNoise = false,
  ): Promise<SignalRecordDTO[]> {
    const normalizedFilter = signalHistoryFilterSchema.parse(filter);
    let query = this.databaseService
      .getClient()
      .from('signals')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (normalizedFilter === 'ALL' && !includeNoise) {
      query = query.in('classification', ['SIGNAL', 'MANAGEMENT']);
    } else if (normalizedFilter === 'SIGNALS') {
      query = query.eq('classification', 'SIGNAL');
    } else if (normalizedFilter === 'MANAGEMENT') {
      query = query.eq('classification', 'MANAGEMENT');
    } else if (normalizedFilter === 'NOISE') {
      query = query.eq('classification', 'NOISE');
    }

    const { data: signals, error } = await query;

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return (signals ?? []).map((signal) => this.toSignalRecordDto(signal as SignalRecord));
  }

  async softDeleteSignals(
    userId: string,
    payload: z.infer<typeof softDeleteSignalsSchema>,
  ): Promise<{ deletedCount: number }> {
    const parsed = softDeleteSignalsSchema.parse(payload);
    const client = this.databaseService.getClient();

    if (parsed.clearAll) {
      const { data, error } = await client
        .from('signals')
        .update({ deleted_at: new Date().toISOString() })
        .eq('user_id', userId)
        .is('deleted_at', null)
        .select('id');

      if (error) {
        throw new InternalServerErrorException(error.message);
      }

      return { deletedCount: data?.length ?? 0 };
    }

    if (!parsed.ids || parsed.ids.length === 0) {
      return { deletedCount: 0 };
    }

    const { data, error } = await client
      .from('signals')
      .update({ deleted_at: new Date().toISOString() })
      .eq('user_id', userId)
      .in('id', parsed.ids)
      .is('deleted_at', null)
      .select('id');

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return { deletedCount: data?.length ?? 0 };
  }

  async getLatestTelegramMessage(userId: string): Promise<SignalRecordDTO | null> {
    const { data, error } = await this.databaseService
      .getClient()
      .from('signals')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .in('classification', ['SIGNAL', 'MANAGEMENT'])
      .not('telegram_message_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return data ? this.toSignalRecordDto(data as SignalRecord) : null;
  }

  async countSignals(userId: string): Promise<number> {
    const query = this.databaseService
      .getClient()
      .from('signals')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('deleted_at', null)
      .in('classification', ['SIGNAL', 'MANAGEMENT']);

    const { count, error } = await query;

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return count ?? 0;
  }

  private async ingestSignalRecord(input: IngestSignalInput) {
    const rawMessageHash = hashText(normalizeRawMessage(input.rawMessage));
    const existing = await this.findExistingTelegramSignal(input);

    if (existing) {
      return {
        record: existing,
        isNew: false,
      };
    }

    const classification = this.classificationForMessage(input.rawMessage);
    const { data: signal, error } = await this.databaseService
      .getClient()
      .from('signals')
      .insert({
        user_id: input.userId,
        raw_message: input.rawMessage,
        raw_message_hash: rawMessageHash,
        source_channel: input.sourceChannel ?? null,
        telegram_message_id: input.telegramMessageId ?? null,
        telegram_channel_id: input.telegramChannelId ?? null,
        message_timestamp: input.messageTimestamp ?? null,
        ingestion_source: input.ingestionSource ?? 'MANUAL',
        classification,
        status: 'PENDING',
      })
      .select('*')
      .single();

    if (error || !signal) {
      const duplicate = await this.findExistingTelegramSignal(input);

      if (duplicate) {
        return {
          record: duplicate,
          isNew: false,
        };
      }

      throw new InternalServerErrorException(
        error?.message ?? 'Failed to store the incoming signal',
      );
    }

    const signalRecord = signal as SignalRecord;

    await this.recordIngestionLog(signalRecord, input);
    await this.enqueueSignalProcessing(signalRecord, rawMessageHash);

    return {
      record: signalRecord,
      isNew: true,
    };
  }

  private async enqueueSignalProcessing(signal: SignalRecord, rawMessageHash: string) {
    await this.signalQueue.add(
      'process-signal',
      {
        signalId: signal.id,
        userId: signal.user_id,
        rawMessage: signal.raw_message,
        rawMessageHash,
        sourceChannel: signal.source_channel,
        telegramMessageId: signal.telegram_message_id,
        telegramChannelId: signal.telegram_channel_id,
        messageTimestamp: signal.message_timestamp,
        ingestionSource: signal.ingestion_source,
        classification: signal.classification,
      },
      {
        jobId: signal.id,
        attempts: 4,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
  }

  private async findExistingTelegramSignal(input: IngestSignalInput) {
    if (!input.telegramChannelId || !input.telegramMessageId) {
      return null;
    }

    const { data, error } = await this.databaseService
      .getClient()
      .from('signals')
      .select('*')
      .eq('user_id', input.userId)
      .eq('telegram_channel_id', input.telegramChannelId)
      .eq('telegram_message_id', input.telegramMessageId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return data as SignalRecord | null;
  }

  private async recordIngestionLog(signal: SignalRecord, input: IngestSignalInput) {
    if (!signal.telegram_message_id || !signal.telegram_channel_id) {
      return;
    }

    await this.executionService.recordLog(
      signal.user_id,
      signal.id,
      'TELEGRAM_MESSAGE_RECEIVED',
      `Telegram message ${signal.telegram_message_id} received from channel ${signal.telegram_channel_id}`,
      {
        attempt: 0,
        details: {
          telegramMessageId: signal.telegram_message_id,
          telegramChannelId: signal.telegram_channel_id,
          sourceChannel: signal.source_channel,
          messageTimestamp: signal.message_timestamp,
          ingestionSource: input.ingestionSource ?? 'TELEGRAM_REALTIME',
        },
      },
    );
  }

  private async requeuePendingSignals() {
    const staleBefore = new Date(Date.now() - 2_000).toISOString();
    const { data, error } = await this.databaseService
      .getClient()
      .from('signals')
      .select('*')
      .eq('status', 'PENDING')
      .is('deleted_at', null)
      .lte('created_at', staleBefore)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      this.logger.warn(`Failed to scan pending signals: ${error.message}`);
      return;
    }

    for (const row of (data ?? []) as SignalRecord[]) {
      try {
        await this.enqueueSignalProcessing(
          row,
          row.raw_message_hash ?? hashText(normalizeRawMessage(row.raw_message)),
        );
      } catch (error) {
        this.logger.warn(`Failed to requeue signal ${row.id}: ${String(error)}`);
      }
    }
  }

  private toSignalRecordDto(signal: SignalRecord): SignalRecordDTO {
    const parsedDataResult =
      signal.parsed_data && typeof signal.parsed_data === 'object'
        ? signalDtoSchema.safeParse(signal.parsed_data)
        : null;
    const parsedData = parsedDataResult?.success ? parsedDataResult.data : null;

    return signalRecordSchema.parse({
      id: signal.id,
      rawMessage: signal.raw_message,
      rawMessageHash: signal.raw_message_hash,
      sourceChannel: signal.source_channel,
      telegramMessageId: signal.telegram_message_id,
      telegramChannelId: signal.telegram_channel_id,
      messageTimestamp: signal.message_timestamp,
      ingestionSource: signal.ingestion_source,
      classification: signal.classification ?? 'SIGNAL',
      deletedAt: signal.deleted_at ?? null,
      parsedData,
      status: signal.status,
      confidence:
        typeof signal.confidence === 'number'
          ? signal.confidence
          : parsedData?.confidence ?? null,
      createdAt: signal.created_at,
    });
  }

  private classificationForMessage(rawMessage: string): SignalClassification {
    return classifySignalMessage(rawMessage);
  }
}
