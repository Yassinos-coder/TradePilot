import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { Api, TelegramClient } from 'telegram';
import { NewMessage } from 'telegram/events';
import { StringSession } from 'telegram/sessions';

import { TELEGRAM_CLIENT_CONNECTION_RETRIES, TELEGRAM_DIALOG_SYNC_LIMIT } from '@tradepilot/config';
import {
  TelegramChannelDTO,
  TelegramChannelSyncResult,
  TelegramConnectStartInput,
  TelegramConnectStartResult,
  TelegramConnectionDTO,
  telegramChannelSchema,
  telegramChannelSyncResultSchema,
  telegramConnectStartResultSchema,
  telegramConnectionSchema,
} from '@tradepilot/shared';

import { DatabaseService } from '../database/database.service';
import {
  TelegramChannelRecord,
  TelegramConnectionRecord,
} from '../database/database.types';
import { SignalsService } from '../signals/signals.service';

const ENCRYPTION_VERSION = 'v1';
const ENCRYPTION_IV_LENGTH = 12;

type TelegramHandler = (event: unknown) => Promise<void>;
type TelegramSubscription = {
  handler: TelegramHandler;
  event: NewMessage;
};

function deriveEncryptionKey(secret: string) {
  return createHash('sha256').update(secret).digest();
}

function encryptText(value: string, secret: string) {
  const iv = randomBytes(ENCRYPTION_IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', deriveEncryptionKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    ENCRYPTION_VERSION,
    iv.toString('base64url'),
    authTag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join(':');
}

function decryptText(payload: string, secret: string) {
  const [version, iv, authTag, ciphertext] = payload.split(':');

  if (
    version !== ENCRYPTION_VERSION ||
    !iv ||
    !authTag ||
    !ciphertext
  ) {
    throw new Error('Unsupported encrypted payload format');
  }

  const decipher = createDecipheriv(
    'aes-256-gcm',
    deriveEncryptionKey(secret),
    Buffer.from(iv, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(authTag, 'base64url'));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64url')),
    decipher.final(),
  ]);

  return plaintext.toString('utf8');
}

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramService.name);
  private readonly clientsByUserId = new Map<string, TelegramClient>();
  private readonly subscriptionsByUserId = new Map<string, TelegramSubscription>();
  private readonly channelsByUserId = new Map<string, Map<string, TelegramChannelRecord>>();

  constructor(
    private readonly configService: ConfigService,
    private readonly databaseService: DatabaseService,
    private readonly signalsService: SignalsService,
  ) {}

  async onModuleInit() {
    if (!this.isConfigured()) {
      this.logger.warn(
        'Telegram integration is disabled because TELEGRAM_API_ID, TELEGRAM_API_HASH, and either TELEGRAM_SESSION_SECRET or TELEGRAM_SESSION_STRING are missing.',
      );
      return;
    }

    await this.restoreConnectedClients();
  }

  async onModuleDestroy() {
    const disconnects = Array.from(this.clientsByUserId.values()).map((client) =>
      client.disconnect().catch(() => undefined),
    );

    await Promise.allSettled(disconnects);
    this.clientsByUserId.clear();
    this.subscriptionsByUserId.clear();
    this.channelsByUserId.clear();
  }

  async getConnection(userId: string): Promise<TelegramConnectionDTO> {
    const connection = await this.findConnection(userId);
    return this.toConnectionDto(connection);
  }

  async startConnection(
    userId: string,
    payload: TelegramConnectStartInput,
  ): Promise<TelegramConnectStartResult> {
    this.assertConfigured();

    const phoneNumber = this.normalizePhoneNumber(payload.phoneNumber);
    await this.disconnectLiveClient(userId);

    const client = await this.createClient('');
    await client.connect();

    try {
      const { apiId, apiHash } = this.getCredentials();
      const { isCodeViaApp, phoneCodeHash } = await client.sendCode(
        { apiId, apiHash },
        phoneNumber,
      );

      const connection = await this.upsertConnection(userId, {
        phone_number: phoneNumber,
        session_ciphertext: this.encryptSession(client),
        status: 'PENDING_CODE',
        phone_code_hash: phoneCodeHash,
        last_error: null,
      });

      this.clientsByUserId.set(userId, client);

      return telegramConnectStartResultSchema.parse({
        connection: this.toConnectionDto(connection),
        codeDelivery: isCodeViaApp ? 'APP' : 'SMS',
      });
    } catch (error) {
      await client.disconnect().catch(() => undefined);
      const message = this.formatTelegramError(error, 'Failed to send the Telegram login code');

      await this.upsertConnection(userId, {
        phone_number: phoneNumber,
        status: 'ERROR',
        last_error: message,
      }).catch(() => undefined);

      throw new BadRequestException(message);
    }
  }

  async verifyCode(userId: string, phoneCode: string): Promise<TelegramConnectionDTO> {
    this.assertConfigured();

    const connection = await this.requireConnection(userId);

    if (!connection.phone_code_hash) {
      throw new BadRequestException('Start Telegram login before submitting a code');
    }

    const client = await this.getClientForConnection(userId, connection);

    try {
      await client.invoke(
        new Api.auth.SignIn({
          phoneNumber: connection.phone_number,
          phoneCodeHash: connection.phone_code_hash,
          phoneCode: phoneCode.trim(),
        }),
      );
    } catch (error) {
      if (this.requiresPassword(error)) {
        const pendingPassword = await this.updateConnection(connection.id, {
          session_ciphertext: this.encryptSession(client),
          status: 'PENDING_PASSWORD',
          last_error: null,
        });

        return this.toConnectionDto(pendingPassword);
      }

      const message = this.formatTelegramError(error, 'Telegram code verification failed');
      const failedConnection = await this.updateConnection(connection.id, {
        session_ciphertext: this.encryptSession(client),
        status: 'ERROR',
        last_error: message,
      });
      return this.toConnectionDto(failedConnection);
    }

    const authorizedConnection = await this.finishAuthorization(userId, connection, client);
    return this.toConnectionDto(authorizedConnection);
  }

  async verifyPassword(userId: string, password: string): Promise<TelegramConnectionDTO> {
    this.assertConfigured();

    const connection = await this.requireConnection(userId);

    if (connection.status !== 'PENDING_PASSWORD') {
      throw new BadRequestException('Telegram password is not required for this account');
    }

    const client = await this.getClientForConnection(userId, connection);

    try {
      const { apiId, apiHash } = this.getCredentials();
      await client.signInWithPassword(
        { apiId, apiHash },
        {
          password: async () => password,
          onError: (error) => {
            throw error;
          },
        },
      );
    } catch (error) {
      const message = this.formatTelegramError(error, 'Telegram password verification failed');
      const failedConnection = await this.updateConnection(connection.id, {
        session_ciphertext: this.encryptSession(client),
        status: 'ERROR',
        last_error: message,
      });
      return this.toConnectionDto(failedConnection);
    }

    const authorizedConnection = await this.finishAuthorization(userId, connection, client);
    return this.toConnectionDto(authorizedConnection);
  }

  async disconnectConnection(userId: string): Promise<TelegramConnectionDTO> {
    await this.disconnectLiveClient(userId);
    this.channelsByUserId.delete(userId);

    const connection = await this.findConnection(userId);

    if (!connection) {
      return this.toConnectionDto(null);
    }

    const { error: deleteChannelsError } = await this.databaseService
      .getClient()
      .from('telegram_channels')
      .delete()
      .eq('user_id', userId);

    if (deleteChannelsError) {
      throw new InternalServerErrorException(deleteChannelsError.message);
    }

    const updated = await this.updateConnection(connection.id, {
      session_ciphertext: null,
      status: 'DISCONNECTED',
      phone_code_hash: null,
      telegram_user_id: null,
      username: null,
      display_name: null,
      last_error: null,
      last_connected_at: null,
      last_synced_at: null,
    });

    return this.toConnectionDto(updated);
  }

  async syncChannels(userId: string): Promise<TelegramChannelSyncResult> {
    this.assertConfigured();

    const connection = await this.requireConnectedConnection(userId);
    const client = await this.getAuthorizedClient(userId, connection);
    const existingChannels = await this.getChannelRecords(userId);
    const enabledByExternalId = new Map(
      existingChannels.map((channel) => [channel.external_id, channel.enabled]),
    );

    const dialogs = await client.getDialogs({ limit: TELEGRAM_DIALOG_SYNC_LIMIT });
    const channelRows: Array<Record<string, unknown>> = [];

    for (const dialogEntry of dialogs) {
      const dialog = dialogEntry as unknown as Record<string, unknown>;
      const entity = dialog.entity;

      if (!entity) {
        continue;
      }

      const isChannel = dialog.isChannel === true;
      const isGroup = dialog.isGroup === true;

      if (!isChannel && !isGroup) {
        continue;
      }

      const externalId = await this.resolvePeerId(client, entity);

      if (!externalId) {
        continue;
      }

      const entityRecord = entity as Record<string, unknown>;
      const name =
        this.asString(dialog.title) ??
        this.asString(entityRecord.title) ??
        this.asString(entityRecord.username) ??
        externalId;

      channelRows.push({
        user_id: userId,
        telegram_connection_id: connection.id,
        external_id: externalId,
        name,
        username: this.asString(entityRecord.username),
        kind: isChannel ? 'CHANNEL' : 'GROUP',
        enabled: enabledByExternalId.get(externalId) ?? false,
      });
    }

    if (channelRows.length > 0) {
      const { error: upsertError } = await this.databaseService
        .getClient()
        .from('telegram_channels')
        .upsert(channelRows, {
          onConflict: 'user_id,external_id',
        });

      if (upsertError) {
        throw new InternalServerErrorException(upsertError.message);
      }
    }

    const syncedExternalIds = new Set(
      channelRows
        .map((channel) =>
          typeof channel.external_id === 'string' ? channel.external_id : null,
        )
        .filter((value): value is string => Boolean(value)),
    );
    const staleIds = existingChannels
      .filter((channel) => !syncedExternalIds.has(channel.external_id))
      .map((channel) => channel.id);

    if (staleIds.length > 0) {
      const { error: deleteError } = await this.databaseService
        .getClient()
        .from('telegram_channels')
        .delete()
        .in('id', staleIds);

      if (deleteError) {
        throw new InternalServerErrorException(deleteError.message);
      }
    }

    const refreshedConnection = await this.updateConnection(connection.id, {
      last_synced_at: new Date().toISOString(),
      last_error: null,
    });
    const channels = await this.getChannelRecords(userId);
    this.primeChannelCache(userId, channels);

    return telegramChannelSyncResultSchema.parse({
      connection: this.toConnectionDto(refreshedConnection),
      channels: channels.map((channel) => this.toChannelDto(channel)),
      syncedCount: channels.length,
    });
  }

  async listChannels(userId: string): Promise<TelegramChannelDTO[]> {
    const channels = await this.getChannelRecords(userId);
    this.primeChannelCache(userId, channels);
    return channels.map((channel) => this.toChannelDto(channel));
  }

  async toggleChannel(userId: string, channelId: string): Promise<TelegramChannelDTO> {
    const { data: existingChannel, error: channelError } = await this.databaseService
      .getClient()
      .from('telegram_channels')
      .select('*')
      .eq('id', channelId)
      .eq('user_id', userId)
      .maybeSingle();

    if (channelError) {
      throw new InternalServerErrorException(channelError.message);
    }

    if (!existingChannel) {
      throw new NotFoundException('Telegram channel was not found');
    }

    const { data: updatedChannel, error: updateError } = await this.databaseService
      .getClient()
      .from('telegram_channels')
      .update({ enabled: !existingChannel.enabled })
      .eq('id', channelId)
      .select('*')
      .single();

    if (updateError || !updatedChannel) {
      throw new InternalServerErrorException(
        updateError?.message ?? 'Failed to update Telegram channel',
      );
    }

    const record = updatedChannel as TelegramChannelRecord;
    const existingCache = this.channelsByUserId.get(userId) ?? new Map<string, TelegramChannelRecord>();
    existingCache.set(record.external_id, record);
    this.channelsByUserId.set(userId, existingCache);

    return this.toChannelDto(record);
  }

  private async restoreConnectedClients() {
    const { data, error } = await this.databaseService
      .getClient()
      .from('telegram_connections')
      .select('*')
      .eq('status', 'CONNECTED')
      .not('session_ciphertext', 'is', null);

    if (error) {
      this.logger.warn(`Failed to restore Telegram sessions: ${error.message}`);
      return;
    }

    for (const row of (data ?? []) as TelegramConnectionRecord[]) {
      try {
        const client = await this.getClientFromCiphertext(row.session_ciphertext);
        await client.connect();

        if (!(await client.checkAuthorization())) {
          await client.disconnect().catch(() => undefined);
          await this.updateConnection(row.id, {
            status: 'ERROR',
            last_error: 'Stored Telegram session is no longer authorized',
          });
          continue;
        }

        this.clientsByUserId.set(row.user_id, client);
        await this.attachMessageHandler(row.user_id, client);
        this.logger.log(`Restored Telegram session for user ${row.user_id}`);
      } catch (error) {
        const message = this.formatTelegramError(
          error,
          'Failed to restore the Telegram session',
        );
        this.logger.warn(`Could not restore Telegram session for ${row.user_id}: ${message}`);
        await this.updateConnection(row.id, {
          status: 'ERROR',
          last_error: message,
        }).catch(() => undefined);
      }
    }
  }

  private async finishAuthorization(
    userId: string,
    connection: TelegramConnectionRecord,
    client: TelegramClient,
  ) {
    const me = await client.getMe();

    if (!me) {
      throw new InternalServerErrorException('Telegram did not return the connected account');
    }

    const entity = me as unknown as Record<string, unknown>;
    const displayName = [this.asString(entity.firstName), this.asString(entity.lastName)]
      .filter((value): value is string => Boolean(value))
      .join(' ')
      .trim();

    const updated = await this.updateConnection(connection.id, {
      session_ciphertext: this.encryptSession(client),
      status: 'CONNECTED',
      phone_code_hash: null,
      telegram_user_id: this.asString(entity.id),
      username: this.asString(entity.username),
      display_name: displayName || this.asString(entity.username) || connection.phone_number,
      last_error: null,
      last_connected_at: new Date().toISOString(),
    });

    this.clientsByUserId.set(userId, client);
    await this.attachMessageHandler(userId, client);
    await this.syncChannels(userId);

    return updated;
  }

  private async getAuthorizedClient(
    userId: string,
    connection: TelegramConnectionRecord,
  ): Promise<TelegramClient> {
    const client = await this.getClientForConnection(userId, connection);

    if (!(await client.checkAuthorization())) {
      throw new BadRequestException('Telegram account is not fully connected');
    }

    return client;
  }

  private async getClientForConnection(
    userId: string,
    connection: TelegramConnectionRecord,
  ): Promise<TelegramClient> {
    const cached = this.clientsByUserId.get(userId);

    if (cached) {
      return cached;
    }

    if (!connection.session_ciphertext) {
      const client = await this.createClient();
      this.clientsByUserId.set(userId, client);
      return client;
    }

    const client = await this.getClientFromCiphertext(connection.session_ciphertext);
    await client.connect();
    this.clientsByUserId.set(userId, client);
    return client;
  }

  private async getClientFromCiphertext(ciphertext: string | null): Promise<TelegramClient> {
    if (!ciphertext) {
      return this.createClient();
    }

    const sessionString = decryptText(
      ciphertext,
      this.configService.getOrThrow<string>('TELEGRAM_SESSION_SECRET'),
    );

    return this.createClient(sessionString);
  }

  private async createClient(session?: string): Promise<TelegramClient> {
    const { apiId, apiHash } = this.getCredentials();
    const initialSession =
      typeof session === 'string'
        ? session
        : (this.configService.get<string>('TELEGRAM_SESSION_STRING') ?? '');

    return new TelegramClient(new StringSession(initialSession), apiId, apiHash, {
      connectionRetries: TELEGRAM_CLIENT_CONNECTION_RETRIES,
    });
  }

  private async attachMessageHandler(userId: string, client: TelegramClient) {
    const existingSubscription = this.subscriptionsByUserId.get(userId);

    if (existingSubscription) {
      client.removeEventHandler(existingSubscription.handler, existingSubscription.event);
    }

    const handler: TelegramHandler = async (event) => {
      try {
        const eventRecord = event as {
          message?: {
            message?: string;
            peerId?: unknown;
          };
        };
        const messageText = eventRecord.message?.message?.trim();

        if (!messageText) {
          return;
        }

        const externalId = await this.resolvePeerId(client, eventRecord.message?.peerId);

        if (!externalId) {
          return;
        }

        const channelMap = await this.getEnabledChannelMap(userId);
        const channel = channelMap.get(externalId);

        if (!channel || !channel.enabled) {
          return;
        }

        await this.signalsService.ingestRawSignal(userId, messageText, channel.name);
      } catch (error) {
        this.logger.warn(
          `Failed to process a Telegram message for user ${userId}: ${this.formatTelegramError(
            error,
            'Unknown Telegram listener failure',
          )}`,
        );
      }
    };

    const event = new NewMessage({});
    client.addEventHandler(handler, event);
    this.subscriptionsByUserId.set(userId, { handler, event });
  }

  private async getEnabledChannelMap(userId: string) {
    const cached = this.channelsByUserId.get(userId);

    if (cached) {
      return cached;
    }

    const channels = await this.getChannelRecords(userId);
    this.primeChannelCache(userId, channels);
    return this.channelsByUserId.get(userId) ?? new Map<string, TelegramChannelRecord>();
  }

  private primeChannelCache(userId: string, channels: TelegramChannelRecord[]) {
    this.channelsByUserId.set(
      userId,
      new Map(channels.map((channel) => [channel.external_id, channel])),
    );
  }

  private async getChannelRecords(userId: string): Promise<TelegramChannelRecord[]> {
    const { data, error } = await this.databaseService
      .getClient()
      .from('telegram_channels')
      .select('*')
      .eq('user_id', userId)
      .order('name', { ascending: true });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return (data ?? []) as TelegramChannelRecord[];
  }

  private async findConnection(userId: string): Promise<TelegramConnectionRecord | null> {
    const { data, error } = await this.databaseService
      .getClient()
      .from('telegram_connections')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return data as TelegramConnectionRecord | null;
  }

  private async requireConnection(userId: string): Promise<TelegramConnectionRecord> {
    const connection = await this.findConnection(userId);

    if (!connection) {
      throw new NotFoundException('Telegram account has not been connected yet');
    }

    return connection;
  }

  private async requireConnectedConnection(userId: string): Promise<TelegramConnectionRecord> {
    const connection = await this.requireConnection(userId);

    if (connection.status !== 'CONNECTED') {
      throw new BadRequestException('Connect and verify your Telegram account first');
    }

    return connection;
  }

  private async upsertConnection(
    userId: string,
    payload: Record<string, unknown>,
  ): Promise<TelegramConnectionRecord> {
    const { data, error } = await this.databaseService
      .getClient()
      .from('telegram_connections')
      .upsert(
        {
          user_id: userId,
          ...payload,
        },
        {
          onConflict: 'user_id',
        },
      )
      .select('*')
      .single();

    if (error || !data) {
      throw new InternalServerErrorException(
        error?.message ?? 'Failed to save the Telegram connection state',
      );
    }

    return data as TelegramConnectionRecord;
  }

  private async updateConnection(
    connectionId: string,
    payload: Record<string, unknown>,
  ): Promise<TelegramConnectionRecord> {
    const { data, error } = await this.databaseService
      .getClient()
      .from('telegram_connections')
      .update(payload)
      .eq('id', connectionId)
      .select('*')
      .single();

    if (error || !data) {
      throw new InternalServerErrorException(
        error?.message ?? 'Failed to update the Telegram connection state',
      );
    }

    return data as TelegramConnectionRecord;
  }

  private async disconnectLiveClient(userId: string) {
    const client = this.clientsByUserId.get(userId);

    if (!client) {
      this.subscriptionsByUserId.delete(userId);
      return;
    }

    const subscription = this.subscriptionsByUserId.get(userId);

    if (subscription) {
      client.removeEventHandler(subscription.handler, subscription.event);
      this.subscriptionsByUserId.delete(userId);
    }

    await client.disconnect().catch(() => undefined);
    this.clientsByUserId.delete(userId);
  }

  private async resolvePeerId(client: TelegramClient, entity: unknown): Promise<string | null> {
    if (!entity) {
      return null;
    }

    try {
      const peerId = await client.getPeerId(entity as never);
      return String(peerId);
    } catch {
      if (
        typeof entity === 'string' ||
        typeof entity === 'number' ||
        typeof entity === 'bigint'
      ) {
        return String(entity);
      }

      return null;
    }
  }

  private toConnectionDto(connection: TelegramConnectionRecord | null): TelegramConnectionDTO {
    return telegramConnectionSchema.parse({
      status: connection?.status ?? 'DISCONNECTED',
      phoneNumber: connection?.phone_number ?? null,
      displayName: connection?.display_name ?? null,
      username: connection?.username ?? null,
      telegramUserId: connection?.telegram_user_id ?? null,
      lastConnectedAt: connection?.last_connected_at ?? null,
      lastSyncedAt: connection?.last_synced_at ?? null,
      lastError: connection?.last_error ?? null,
    });
  }

  private toChannelDto(channel: TelegramChannelRecord): TelegramChannelDTO {
    return telegramChannelSchema.parse({
      id: channel.id,
      externalId: channel.external_id,
      name: channel.name,
      username: channel.username,
      kind: channel.kind,
      enabled: channel.enabled,
    });
  }

  private normalizePhoneNumber(value: string) {
    const normalized = value.replace(/[^\d+]/g, '');
    return normalized.startsWith('+') ? normalized : `+${normalized}`;
  }

  private encryptSession(client: TelegramClient) {
    const sessionString = client.session.save();
    return encryptText(
      typeof sessionString === 'string' ? sessionString : String(sessionString),
      this.configService.getOrThrow<string>('TELEGRAM_SESSION_SECRET'),
    );
  }

  private requiresPassword(error: unknown) {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const candidate = error as { errorMessage?: string; message?: string };
    return [candidate.errorMessage, candidate.message].some((value) =>
      typeof value === 'string' ? value.includes('SESSION_PASSWORD_NEEDED') : false,
    );
  }

  private formatTelegramError(error: unknown, fallback: string) {
    if (error instanceof Error && error.message) {
      return error.message;
    }

    if (error && typeof error === 'object' && 'errorMessage' in error) {
      const message = (error as { errorMessage?: unknown }).errorMessage;
      if (typeof message === 'string' && message.length > 0) {
        return message;
      }
    }

    return fallback;
  }

  private asString(value: unknown): string | null {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }

    if (typeof value === 'number' || typeof value === 'bigint') {
      return String(value);
    }

    return null;
  }

  private isConfigured() {
    return Boolean(
      this.configService.get<number>('TELEGRAM_API_ID') &&
        this.configService.get<string>('TELEGRAM_API_HASH') &&
        (this.configService.get<string>('TELEGRAM_SESSION_SECRET') ||
          this.configService.get<string>('TELEGRAM_SESSION_STRING')),
    );
  }

  private assertConfigured() {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        'Telegram integration is not configured on the server yet',
      );
    }
  }

  private getCredentials() {
    return {
      apiId: this.configService.getOrThrow<number>('TELEGRAM_API_ID'),
      apiHash: this.configService.getOrThrow<string>('TELEGRAM_API_HASH'),
    };
  }
}
