import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { IncomingMessage, Server as HttpServer } from 'node:http';
import { Server as WebSocketServer, WebSocket } from 'ws';

import {
  DEFAULT_EA_HEARTBEAT_TIMEOUT_MS,
  DEFAULT_EA_SERVER_PING_INTERVAL_MS,
  EA_DISPATCH_ACK_PREFIX,
  EA_DISPATCH_CHANNEL,
  EA_WEBSOCKET_PATH,
} from '@tradepilot/config';
import {
  AccountStatusDTO,
  EaAccountStatusPayload,
  EaTradeEventPayload,
  WebSocketInboundMessage,
  WebSocketOutboundMessage,
  accountStatusDtoSchema,
  eaInboundMessageSchema,
} from '@tradepilot/shared';
import { deriveBaseSymbol } from '@tradepilot/trading';

import { ApiKeysService } from '../api-keys/services/api-keys.service';
import { CopierLinksService } from '../copier/services/copier-links.service';
import { CopierService } from '../copier/services/copier.service';
import { DatabaseService } from '../database/database.service';
import {
  AccountStatusSnapshotRecord,
  ExecutionStatus,
  TradeExecutionRecord,
} from '../database/database.types';
import { RedisService } from '../redis/redis.service';
import { CacheService } from '../redis/cache.service';
import { buildAlertTemplate } from '../notifications/email-templates';
import { NotificationEventBusService } from '../notifications/notification-event-bus.service';

import {
  DispatchAckMessage,
  DispatchEventMessage,
  EaConnectionAccountState,
  EaConnectionState,
} from './interfaces/ea.interfaces';
import { DispatchIntentService } from './services/dispatch-intent.service';
import { EaPresenceService, PresencePayload } from './services/ea-presence.service';

interface SocketMetadata {
  connectionId: string;
  userId?: string;
  accountId?: string;
  accountName?: string;
  lastSeenAt: number;
  latencyMs: number | null;
  lastServerPingAt: number | null;
}

interface PendingStateSync {
  pendingAccountIds: Set<string>;
  resolve: () => void;
  timeout: NodeJS.Timeout;
}

@Injectable()
export class EaGatewayService implements OnModuleDestroy, OnModuleInit {
  private readonly logger = new Logger(EaGatewayService.name);
  private readonly instanceId = randomUUID();
  private server?: WebSocketServer;
  private heartbeatTimer?: NodeJS.Timeout;
  private readonly socketsByUser = new Map<string, Map<string, WebSocket>>();
  private readonly socketMetadata = new Map<WebSocket, SocketMetadata>();
  private readonly messageQueues = new Map<WebSocket, Promise<void>>();
  private readonly pendingStateSyncs = new Map<string, PendingStateSync>();
  private readonly inFlightStateSyncs = new Map<string, Promise<void>>();
  private readonly recentStateSyncs = new Map<string, number>();
  private attached = false;
  private unsubscribeDispatch?: () => Promise<void>;

  constructor(
    private readonly apiKeysService: ApiKeysService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly cacheService: CacheService,
    private readonly databaseService: DatabaseService,
    private readonly notificationEventBus: NotificationEventBusService,
    private readonly presenceService: EaPresenceService,
    private readonly dispatchIntentService: DispatchIntentService,
    private readonly copierService: CopierService,
    private readonly copierLinksService: CopierLinksService,
  ) {}

  async onModuleInit() {
    this.unsubscribeDispatch = await this.redisService.subscribe(
      EA_DISPATCH_CHANNEL,
      async (rawMessage) => {
        await this.handleDispatchEvent(rawMessage);
      },
    );

    this.startHeartbeatMonitor();
  }

  attach(httpServer: HttpServer) {
    if (this.attached) {
      return;
    }

    this.server = new WebSocketServer({ noServer: true });

    httpServer.on('upgrade', (request, socket, head) => {
      const url = new URL(request.url ?? '', 'http://localhost');

      if (url.pathname !== EA_WEBSOCKET_PATH || !this.server) {
        socket.destroy();
        return;
      }

      this.server.handleUpgrade(request, socket, head, (client) => {
        this.server?.emit('connection', client, request);
      });
    });

    this.server.on('connection', (client, request) => {
      this.handleConnection(client, request);
    });

    this.attached = true;
  }

  async getConnectionState(userId: string): Promise<EaConnectionState> {
    const accounts = await this.listConnectionStates(userId);
    const latest = [...accounts].sort(
      (left, right) => new Date(right.lastSeenAt).getTime() - new Date(left.lastSeenAt).getTime(),
    )[0];

    return {
      online: accounts.length > 0,
      latencyMs: latest?.latencyMs ?? null,
      lastSeenAt: latest?.lastSeenAt ?? null,
      connectionCount: accounts.length,
      accounts,
    };
  }

  async listConnectionStates(userId: string): Promise<EaConnectionAccountState[]> {
    const presences = await this.presenceService.list(userId);
    const latestStatuses = await this.getLatestStatusesByAccount(userId);

    return presences
      .map((presence) => ({
        accountId: presence.accountId,
        accountName: presence.accountName,
        latencyMs: presence.latencyMs,
        lastSeenAt: new Date(presence.lastSeenAt).toISOString(),
        accountStatus: latestStatuses.get(presence.accountId) ?? null,
      }));
  }

  async requestStateSync(userId: string, accountId?: string): Promise<void> {
    const syncKey = `${userId}:${accountId ?? '*'}`;
    const lastCompletedAt = this.recentStateSyncs.get(syncKey) ?? 0;
    if (Date.now() - lastCompletedAt < 5_000) {
      return;
    }

    const existing = this.inFlightStateSyncs.get(syncKey);

    if (existing) {
      await existing;
      return;
    }

    const promise = this.performStateSync(userId, accountId).finally(() => {
      this.inFlightStateSyncs.delete(syncKey);
      this.recentStateSyncs.set(syncKey, Date.now());
    });

    this.inFlightStateSyncs.set(syncKey, promise);
    await promise;
  }

  async dispatchProxyCommand(
    userId: string,
    accountId: string,
    message: WebSocketOutboundMessage,
  ): Promise<boolean> {
    const userConnections = this.socketsByUser.get(userId);
    const connection = userConnections?.get(accountId);

    if (!connection || connection.readyState !== WebSocket.OPEN) {
      return false;
    }

    this.sendMessage(connection, message);
    return true;
  }

  onModuleDestroy() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    if (this.unsubscribeDispatch) {
      void this.unsubscribeDispatch();
    }

    this.server?.close();
  }

  private handleConnection(client: WebSocket, _request: IncomingMessage) {
    this.socketMetadata.set(client, {
      connectionId: randomUUID(),
      lastSeenAt: Date.now(),
      latencyMs: null,
      lastServerPingAt: null,
    });

    client.on('message', (buffer) => {
      // State sync sends many lifecycle events in a burst. Process them in wire
      // order so an OPEN upsert cannot race and overwrite the following CLOSED
      // event for the same ticket.
      const previous = this.messageQueues.get(client) ?? Promise.resolve();
      const current = previous
        .then(() => this.handleMessage(client, buffer.toString()))
        .catch((error) => {
          this.logger.warn(`EA message handling failed: ${String(error)}`);
        })
        .finally(() => {
          if (this.messageQueues.get(client) === current) {
            this.messageQueues.delete(client);
          }
        });

      this.messageQueues.set(client, current);
    });

    client.on('close', () => {
      void this.removeConnection(client);
    });

    client.on('error', (error) => {
      this.logger.warn(`EA connection error: ${String(error)}`);
      void this.removeConnection(client);
    });
  }

  private async handleMessage(client: WebSocket, rawMessage: string) {
    const parsedJson = this.tryParseJson(rawMessage);

    if (!parsedJson) {
      this.sendMessage(client, {
        type: 'error',
        message: 'WebSocket payload must be valid JSON',
      });
      return;
    }

    const parsedMessage = eaInboundMessageSchema.safeParse(parsedJson);

    if (!parsedMessage.success) {
      this.logger.warn(`EA message validation failed: ${parsedMessage.error.message}`);
      this.sendMessage(client, {
        type: 'error',
        message: 'Unsupported WebSocket message',
      });
      return;
    }

    const message: WebSocketInboundMessage = parsedMessage.data;
    await this.touch(client);

    if (message.type === 'auth') {
      const resolved = await this.apiKeysService.resolveKey(message.apiKey, 'EA');

      if (!resolved) {
        this.sendMessage(client, {
          type: 'error',
          message: 'Invalid, expired or revoked API key',
        });
        client.close();
        return;
      }

      await this.registerSocket(
        client,
        resolved.userId,
        message.accountId,
        message.accountName,
        {
          platform: message.platform ?? null,
          currency: message.currency ?? null,
          leverage: message.leverage ?? null,
        },
      );
      this.sendMessage(client, { type: 'auth_success' });
      return;
    }

    const metadata = this.socketMetadata.get(client);

    if (!metadata?.userId || !metadata.accountId) {
      this.sendMessage(client, {
        type: 'error',
        message: 'Authenticate before sending telemetry messages',
      });
      return;
    }

    if (message.type === 'ping') {
      this.sendMessage(client, {
        type: 'pong',
        timestamp: message.timestamp ?? Date.now(),
      });
      return;
    }

    if (message.type === 'pong') {
      const referenceTimestamp = message.timestamp ?? metadata.lastServerPingAt;
      const latencyMs =
        typeof referenceTimestamp === 'number'
          ? Math.max(0, Date.now() - referenceTimestamp)
          : null;

      if (latencyMs !== null) {
        await this.updateLatency(client, latencyMs);
      }
      return;
    }

    if (message.type === 'symbols') {
      await this.storeSymbols(metadata.userId, metadata.accountId, message.symbols);
      return;
    }

    if (message.type === 'account_status') {
      await this.storeAccountStatus(
        metadata.userId,
        metadata.accountId,
        metadata.accountName ?? null,
        message.data,
      );
      return;
    }

    if (message.type === 'trade_event') {
      await this.storeTradeEvent(
        metadata.userId,
        metadata.accountId,
        metadata.accountName ?? null,
        message.data,
      );
      return;
    }

    if (message.type === 'command_result') {
      await this.storeCommandResult(
        metadata.userId,
        metadata.accountId,
        metadata.accountName ?? null,
        message,
      );
      return;
    }

    if (message.type === 'sync_state_complete') {
      this.resolvePendingStateSync(message.request_id, metadata.accountId);
    }
  }

  private async handleDispatchEvent(rawMessage: string) {
    const payload = this.tryParseJson(rawMessage);

    if (!payload) {
      return;
    }

    const event = payload as DispatchEventMessage;
    const userConnections = this.socketsByUser.get(event.userId);

    if (!userConnections || userConnections.size === 0) {
      return;
    }

    let deliveredCount = 0;
    const deliveredAccountIds: string[] = [];

    for (const command of event.commands) {
      const connection = userConnections.get(command.accountId);

      if (!connection) {
        continue;
      }

      if (connection.readyState !== WebSocket.OPEN) {
        await this.removeConnection(connection);
        continue;
      }

      try {
        connection.send(JSON.stringify(command.message));
        deliveredCount += 1;
        deliveredAccountIds.push(command.accountId);
      } catch (error) {
        this.logger.warn(`Failed to forward signal to EA socket: ${String(error)}`);
        await this.removeConnection(connection);
      }
    }

    if (deliveredCount > 0) {
      const ack: DispatchAckMessage = {
        eventId: event.eventId,
        delivered: true,
        deliveredCount,
        deliveredAccountIds,
        instanceId: this.instanceId,
        userId: event.userId,
      };

      await this.redisService.publish(
        `${EA_DISPATCH_ACK_PREFIX}:${event.eventId}`,
        JSON.stringify(ack),
      );
    }
  }

  private async registerSocket(
    client: WebSocket,
    userId: string,
    accountId: string,
    accountName: string,
    terminalInfo: {
      platform: 'MT4' | 'MT5' | null;
      currency: string | null;
      leverage: number | null;
    },
  ) {
    const metadata = this.socketMetadata.get(client);

    if (!metadata) {
      return;
    }

    const existingConnections = this.socketsByUser.get(userId) ?? new Map<string, WebSocket>();
    const previousConnection = existingConnections.get(accountId);

    if (previousConnection && previousConnection !== client) {
      await this.removeConnection(previousConnection);
      previousConnection.close();
    }

    this.socketMetadata.set(client, {
      ...metadata,
      userId,
      accountId,
      accountName,
      lastSeenAt: Date.now(),
    });

    existingConnections.set(accountId, client);
    this.socketsByUser.set(userId, existingConnections);
    await this.upsertEaAccount(
      userId,
      accountId,
      accountName,
      metadata.latencyMs,
      metadata.lastSeenAt,
      terminalInfo,
    );
    await this.persistPresence(client);
  }

  private async performStateSync(userId: string, accountId?: string): Promise<void> {
    const userConnections = this.socketsByUser.get(userId);

    if (!userConnections || userConnections.size === 0) {
      return;
    }

    const targets = accountId
      ? [[accountId, userConnections.get(accountId) ?? null] as const]
      : [...userConnections.entries()].map(([id, socket]) => [id, socket] as const);

    const openTargets = targets.filter(
      (entry): entry is readonly [string, WebSocket] => {
        const socket = entry[1];
        return socket !== null && socket.readyState === WebSocket.OPEN;
      },
    );

    if (openTargets.length === 0) {
      return;
    }

    const requestId = randomUUID();
    const timeoutMs =
      this.configService.get<number>('EA_STATE_SYNC_TIMEOUT_MS') ?? 10_000;

    let resolveSync: () => void = () => undefined;
    const donePromise = new Promise<void>((resolve) => {
      resolveSync = resolve;
    });

    const timeout = setTimeout(() => {
      this.pendingStateSyncs.delete(requestId);
      resolveSync();
    }, timeoutMs);

    this.pendingStateSyncs.set(requestId, {
      pendingAccountIds: new Set(openTargets.map(([id]) => id)),
      resolve: resolveSync,
      timeout,
    });

    for (const [, socket] of openTargets) {
      this.sendMessage(socket, {
        type: 'sync_state',
        request_id: requestId,
      });
    }

    const pending = this.pendingStateSyncs.get(requestId);
    if (!pending || pending.pendingAccountIds.size === 0) {
      clearTimeout(timeout);
      this.pendingStateSyncs.delete(requestId);
      resolveSync();
    }

    await donePromise;
  }

  private async touch(client: WebSocket) {
    const metadata = this.socketMetadata.get(client);

    if (!metadata) {
      return;
    }

    this.socketMetadata.set(client, {
      ...metadata,
      lastSeenAt: Date.now(),
    });
    await this.persistPresence(client);
  }

  private async updateLatency(client: WebSocket, latencyMs: number) {
    const metadata = this.socketMetadata.get(client);

    if (!metadata) {
      return;
    }

    this.socketMetadata.set(client, {
      ...metadata,
      latencyMs,
      lastSeenAt: Date.now(),
    });
    await this.persistPresence(client);
  }

  private startHeartbeatMonitor() {
    const timeoutMs =
      this.configService.get<number>('EA_HEARTBEAT_TIMEOUT_MS') ??
      DEFAULT_EA_HEARTBEAT_TIMEOUT_MS;
    const pingIntervalMs =
      this.configService.get<number>('EA_SERVER_PING_INTERVAL_MS') ??
      DEFAULT_EA_SERVER_PING_INTERVAL_MS;

    this.heartbeatTimer = setInterval(() => {
      const threshold = Date.now() - timeoutMs;

      for (const [socket, metadata] of this.socketMetadata.entries()) {
        if (metadata.lastSeenAt < threshold) {
          socket.close();
          void this.removeConnection(socket);
          continue;
        }

        if (metadata.userId && metadata.accountId && socket.readyState === WebSocket.OPEN) {
          const timestamp = Date.now();

          this.socketMetadata.set(socket, {
            ...metadata,
            lastServerPingAt: timestamp,
          });
          this.sendMessage(socket, {
            type: 'ping',
            timestamp,
          });
        }
      }
    }, pingIntervalMs);
  }

  private async persistPresence(client: WebSocket) {
    const metadata = this.socketMetadata.get(client);

    if (!metadata?.userId || !metadata.accountId) {
      return;
    }

    const ttlMs = this.configService.get<number>('EA_PRESENCE_TTL_MS') ?? 18_000;
    await this.upsertEaAccount(
      metadata.userId,
      metadata.accountId,
      metadata.accountName ?? metadata.accountId,
      metadata.latencyMs,
      metadata.lastSeenAt,
    );
    await this.presenceService.set(
      metadata.userId,
      {
        connectionId: metadata.connectionId,
        instanceId: this.instanceId,
        accountId: metadata.accountId,
        accountName: metadata.accountName ?? null,
        lastSeenAt: metadata.lastSeenAt,
        latencyMs: metadata.latencyMs,
      } satisfies PresencePayload,
      ttlMs,
    );
  }

  private async removeConnection(client: WebSocket) {
    const metadata = this.socketMetadata.get(client);

    if (!metadata) {
      return;
    }

    if (metadata.userId && metadata.accountId) {
      const connections = this.socketsByUser.get(metadata.userId);
      let userIsNowOffline = false;

      if (connections) {
        connections.delete(metadata.accountId);

        if (connections.size === 0) {
          this.socketsByUser.delete(metadata.userId);
          userIsNowOffline = true;
        }
      }

      await this.presenceService.remove(metadata.userId, metadata.accountId);

      if (userIsNowOffline) {
        this.notificationEventBus.emit({
          userId: metadata.userId,
          event: 'eaDisconnected',
          title: 'All EA connections are offline',
          body: `The last connected account (${metadata.accountName ?? metadata.accountId}) just disconnected.`,
          html: buildAlertTemplate(
            'All EA connections are offline',
            `The last connected account (${metadata.accountName ?? metadata.accountId}) just disconnected.`,
            {
              tone: 'danger',
              eyebrow: 'Connectivity Alert',
              details: [
                { label: 'Account', value: metadata.accountName ?? metadata.accountId },
                { label: 'Status', value: 'No authenticated EA connections remain online' },
              ],
            },
          ),
          metadata: {
            accountId: metadata.accountId,
            accountName: metadata.accountName ?? metadata.accountId,
          },
        });
      }
    }

    this.socketMetadata.delete(client);
    this.messageQueues.delete(client);
  }

  private async upsertEaAccount(
    userId: string,
    accountId: string,
    accountName: string,
    latencyMs: number | null,
    lastSeenAt: number,
    terminalInfo?: {
      platform: 'MT4' | 'MT5' | null;
      currency: string | null;
      leverage: number | null;
    },
  ) {
    // `role` is deliberately absent: it is set by the user in the copier UI and
    // must survive every reconnect.
    const { error } = await this.databaseService
      .getClient()
      .from('accounts')
      .upsert(
        {
          user_id: userId,
          external_account_id: accountId,
          name: accountName,
          broker: 'MetaTrader',
          source: 'EA',
          last_seen_at: new Date(lastSeenAt).toISOString(),
          latency_ms: latencyMs,
          ...(terminalInfo?.platform ? { platform: terminalInfo.platform } : {}),
          ...(terminalInfo?.currency ? { currency: terminalInfo.currency } : {}),
          ...(terminalInfo?.leverage ? { leverage: terminalInfo.leverage } : {}),
        },
        {
          onConflict: 'user_id,external_account_id',
        },
      );

    if (error) {
      this.logger.warn(`Failed to upsert EA account ${accountId}: ${error.message}`);
    }
  }

  private async storeSymbols(userId: string, accountId: string, symbols: string[]) {
    const uniqueSymbols = Array.from(
      new Set(
        symbols
          .map((symbol) => symbol.trim())
          .filter((symbol) => symbol.length > 0),
      ),
    );

    const client = this.databaseService.getClient();
    const { error: deleteError } = await client
      .from('user_symbols')
      .delete()
      .eq('user_id', userId)
      .eq('account_id', accountId);

    if (deleteError) {
      throw new Error(deleteError.message);
    }

    if (uniqueSymbols.length === 0) {
      return;
    }

    const { error } = await client.from('user_symbols').insert(
      uniqueSymbols.map((symbol) => ({
        user_id: userId,
        account_id: accountId,
        symbol,
        base_symbol: deriveBaseSymbol(symbol),
      })),
    );

    if (error) {
      throw new Error(error.message);
    }
  }

  private async storeAccountStatus(
    userId: string,
    accountId: string,
    accountName: string | null,
    payload: EaAccountStatusPayload,
  ) {
    const { data, error } = await this.databaseService
      .getClient()
      .from('ea_account_status_snapshots')
      .insert({
        user_id: userId,
        account_id: accountId,
        account_name: accountName,
        balance: payload.balance,
        equity: payload.equity,
        margin: payload.margin,
        free_margin: payload.freeMargin,
        drawdown_percent: payload.drawdownPercent,
        open_positions: payload.openPositions,
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? 'Failed to store EA account status');
    }

    await this.insertExecutionEvent(
      userId,
      null,
      'ACCOUNT_STATUS_RECEIVED',
      'Received EA account status update',
      {
        accountId,
        accountName,
        balance: payload.balance,
        equity: payload.equity,
        drawdownPercent: payload.drawdownPercent,
        openPositions: payload.openPositions,
      },
      accountId,
      accountName,
    );
  }

  private async storeTradeEvent(
    userId: string,
    accountId: string,
    accountName: string | null,
    payload: EaTradeEventPayload,
  ) {
    const { data: existing, error: existingError } = await this.databaseService
      .getClient()
      .from('trade_executions')
      .select('*')
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .eq('ticket', payload.ticket)
      .maybeSingle();

    if (existingError) {
      throw new Error(existingError.message);
    }

    const existingRecord = (existing as TradeExecutionRecord | null) ?? null;

    // History snapshots can arrive out of order (especially after login or an
    // EA reconnect). A stale opening deal must never resurrect a position that
    // Supabase already knows was closed.
    if (existingRecord?.status === 'CLOSED' && payload.status === 'OPEN') {
      return;
    }

    const openingOrderType = this.resolveOpeningOrderType(existingRecord, payload);
    const positionDirection = this.resolvePositionDirection(existingRecord, payload);
    const closeReason =
      payload.status === 'CLOSED'
        ? this.resolveCloseReason(existingRecord, payload)
        : existingRecord?.close_reason ?? null;

    // The order comment carries the execution key the dispatch was sent with.
    const entryType = existingRecord?.entry_type
      ?? (await this.dispatchIntentService.resolve(payload.comment));

    const record = {
      user_id: userId,
      copy_event_id: payload.signal_id ?? null,
      entry_type: entryType,
      account_id: accountId,
      account_name: accountName,
      ticket: payload.ticket,
      symbol: payload.symbol,
      type: openingOrderType,
      opening_order_type: openingOrderType,
      position_direction: positionDirection,
      close_reason: closeReason,
      volume: payload.volume,
      entry_price: payload.entry_price,
      exit_price: payload.exit_price,
      stop_loss: payload.stop_loss,
      take_profit: payload.take_profit,
      profit: payload.profit,
      status: payload.status,
      comment: payload.comment ?? null,
      opened_at: payload.opened_at,
      closed_at: payload.closed_at,
    };

    if (
      existingRecord &&
      this.isTradeExecutionUnchanged(existing as TradeExecutionRecord, record)
    ) {
      return;
    }

    const { error } = await this.databaseService
      .getClient()
      .from('trade_executions')
      .upsert(
        record,
        {
          onConflict: 'user_id,account_id,ticket',
        },
      );

    if (error) {
      throw new Error(error.message);
    }

    await this.cacheService.invalidateUserAnalytics(userId);

    const status = this.tradeEventToExecutionStatus(payload.status);
    const message = this.tradeEventMessage(payload, accountId, positionDirection);

    await this.insertExecutionEvent(
      userId,
      payload.signal_id ?? null,
      status,
      message,
      {
        accountId,
        accountName,
        ticket: payload.ticket,
        symbol: payload.symbol,
        openingOrderType,
        positionDirection,
        volume: payload.volume,
        profit: payload.profit,
        status: payload.status,
        closeReason,
        openedAt: payload.opened_at,
        closedAt: payload.closed_at,
      },
      accountId,
      accountName,
    );

    await this.fanOutIfMaster(userId, accountId, existingRecord, payload);

    // A fill on a slave closes the loop: record its ticket against the copy order
    // so a later close or modify on the master can target this exact position.
    if (payload.comment && payload.status === 'OPEN') {
      await this.copierService
        .linkSlaveFill(payload.comment, payload.ticket, payload.volume)
        .catch((error) => {
          this.logger.warn(`Failed to link slave fill: ${String(error)}`);
        });
    }

    if (payload.status === 'OPEN') {
      this.notificationEventBus.emit({
        userId,
        event: 'newTradeOpened',
        title: `${payload.symbol} ${openingOrderType} opened`,
        body: `TradePilot opened ${payload.symbol} ${openingOrderType} on account ${accountId}.`,
        html: buildAlertTemplate(
          `${payload.symbol} ${openingOrderType} opened`,
          `TradePilot opened ${payload.symbol} ${openingOrderType} on account ${accountId}.`,
          {
            tone: 'success',
            eyebrow: 'Trade Opened',
            details: [
              { label: 'Account', value: accountName ?? accountId },
              { label: 'Direction', value: `${openingOrderType} (${positionDirection})` },
              { label: 'Volume', value: payload.volume.toFixed(2) },
              { label: 'Entry', value: payload.entry_price.toFixed(5) },
              {
                label: 'Take profit',
                value:
                  payload.take_profit !== null ? payload.take_profit.toFixed(5) : 'Not set',
              },
              {
                label: 'Stop loss',
                value: payload.stop_loss !== null ? payload.stop_loss.toFixed(5) : 'Not set',
              },
            ],
          },
        ),
        metadata: {
          accountId,
          accountName,
          ticket: payload.ticket,
          symbol: payload.symbol,
          openingOrderType,
          positionDirection,
        },
      });
    }

    if (payload.status === 'CLOSED' && closeReason === 'TP') {
      this.notificationEventBus.emit({
        userId,
        event: 'tpHit',
        title: `${payload.symbol} take profit hit`,
        body: `${payload.symbol} ${openingOrderType} closed at take profit on account ${accountId}.`,
        html: buildAlertTemplate(
          `${payload.symbol} take profit hit`,
          `${payload.symbol} ${openingOrderType} closed at take profit on account ${accountId}.`,
          {
            tone: 'success',
            eyebrow: 'Take Profit',
            details: [
              { label: 'Account', value: accountName ?? accountId },
              { label: 'Direction', value: `${openingOrderType} (${positionDirection})` },
              {
                label: 'Exit',
                value: payload.exit_price !== null ? payload.exit_price.toFixed(5) : 'Not set',
              },
              { label: 'Net PnL', value: payload.profit.toFixed(2) },
            ],
          },
        ),
        metadata: {
          accountId,
          accountName,
          ticket: payload.ticket,
          symbol: payload.symbol,
          profit: payload.profit,
          closeReason,
        },
      });
    }

    if (payload.status === 'CLOSED' && closeReason === 'SL') {
      this.notificationEventBus.emit({
        userId,
        event: 'slHit',
        title: `${payload.symbol} stop loss hit`,
        body: `${payload.symbol} ${openingOrderType} closed at stop loss on account ${accountId}.`,
        html: buildAlertTemplate(
          `${payload.symbol} stop loss hit`,
          `${payload.symbol} ${openingOrderType} closed at stop loss on account ${accountId}.`,
          {
            tone: 'danger',
            eyebrow: 'Stop Loss',
            details: [
              { label: 'Account', value: accountName ?? accountId },
              { label: 'Direction', value: `${openingOrderType} (${positionDirection})` },
              {
                label: 'Exit',
                value: payload.exit_price !== null ? payload.exit_price.toFixed(5) : 'Not set',
              },
              { label: 'Net PnL', value: payload.profit.toFixed(2) },
            ],
          },
        ),
        metadata: {
          accountId,
          accountName,
          ticket: payload.ticket,
          symbol: payload.symbol,
          profit: payload.profit,
          closeReason,
        },
      });
    }
  }

  private async storeCommandResult(
    userId: string,
    accountId: string,
    accountName: string | null,
    payload: Extract<WebSocketInboundMessage, { type: 'command_result' }>,
  ) {
    const symbolLabel = payload.symbol || 'N/A';

    if (payload.status === 'ERROR') {
      this.notificationEventBus.emit({
        userId,
        event: 'executionFailed',
        title: `Execution failed on account ${accountId}`,
        body: payload.message,
        html: buildAlertTemplate(`Execution failed on account ${accountId}`, payload.message, {
          tone: 'danger',
          eyebrow: 'Execution Failure',
          details: [
            { label: 'Action', value: payload.action },
            { label: 'Symbol', value: symbolLabel },
            { label: 'Account', value: accountName ?? accountId },
          ],
        }),
        metadata: {
          accountId,
          accountName,
          action: payload.action,
          symbol: payload.symbol ?? null,
          executionKey: payload.execution_key,
          details: payload.details ?? null,
        },
      });
    }

    if (payload.execution_key) {
      await this.copierService
        .recordCommandOutcome(
          payload.execution_key,
          payload.status === 'SUCCESS',
          payload.message,
        )
        .catch((error) => {
          this.logger.warn(`Failed to record copy command outcome: ${String(error)}`);
        });
    }

    await this.insertExecutionEvent(
      userId,
      payload.signal_id ?? null,
      payload.status === 'SUCCESS' ? 'COMMAND_SUCCEEDED' : 'COMMAND_FAILED',
      payload.message,
      {
        accountId,
        accountName,
        action: payload.action,
        symbol: payload.symbol ?? null,
        executionKey: payload.execution_key,
        details: payload.details ?? null,
      },
      accountId,
      accountName,
      payload.execution_key ?? null,
    );
  }

  /**
   * If the reporting terminal is the user's MASTER, hand the event to the copier
   * so it can mirror onto every enabled slave link.
   */
  private async fanOutIfMaster(
    userId: string,
    accountId: string,
    existingRecord: TradeExecutionRecord | null,
    payload: EaTradeEventPayload,
  ) {
    if (payload.status === 'REJECTED') {
      return;
    }

    try {
      const master = await this.copierLinksService.findMasterByExternalId(userId, accountId);

      if (!master) {
        return;
      }

      const action = this.resolveCopyAction(existingRecord, payload);

      if (!action) {
        return;
      }

      await this.copierService.onMasterTradeEvent({
        userId,
        masterAccountId: master.id,
        masterExternalAccountId: accountId,
        masterTicket: payload.ticket,
        action,
        symbol: payload.symbol,
        baseSymbol: deriveBaseSymbol(payload.symbol),
        side: payload.opening_order_type ?? payload.type,
        volume: payload.volume,
        entryPrice: payload.entry_price,
        stopLoss: payload.stop_loss,
        takeProfit: payload.take_profit,
        closePercent:
          action === 'PARTIAL_CLOSE' ? this.resolveClosePercent(existingRecord, payload) : null,
        masterEventAt: payload.status === 'CLOSED'
          ? payload.closed_at ?? new Date().toISOString()
          : payload.opened_at,
      });
    } catch (error) {
      // A copier failure must never break telemetry ingestion for the master.
      this.logger.error(`Copy fan-out failed for account ${accountId}: ${String(error)}`);
    }
  }

  /**
   * The EA reports position state, not intent, so the action is inferred by
   * diffing against what we already stored for this ticket.
   */
  private resolveCopyAction(
    existingRecord: TradeExecutionRecord | null,
    payload: EaTradeEventPayload,
  ): 'OPEN' | 'CLOSE' | 'PARTIAL_CLOSE' | 'MODIFY' | null {
    if (payload.status === 'CLOSED') {
      return 'CLOSE';
    }

    if (!existingRecord) {
      return 'OPEN';
    }

    if (payload.volume < Number(existingRecord.volume)) {
      return 'PARTIAL_CLOSE';
    }

    const stopChanged = !this.numbersMatch(existingRecord.stop_loss, payload.stop_loss);
    const takeProfitChanged = !this.numbersMatch(existingRecord.take_profit, payload.take_profit);

    if (stopChanged || takeProfitChanged) {
      return 'MODIFY';
    }

    // Same ticket, same volume, same levels: a heartbeat resend, not an action.
    return null;
  }

  private resolveClosePercent(
    existingRecord: TradeExecutionRecord | null,
    payload: EaTradeEventPayload,
  ): number {
    const previousVolume = Number(existingRecord?.volume ?? 0);

    if (previousVolume <= 0 || payload.volume >= previousVolume) {
      return 100;
    }

    const closedFraction = (previousVolume - payload.volume) / previousVolume;
    return Math.min(100, Math.max(1, Math.round(closedFraction * 100)));
  }

  private numbersMatch(left: number | null, right: number | null): boolean {
    if (left === null && right === null) {
      return true;
    }

    if (left === null || right === null) {
      return false;
    }

    return Math.abs(Number(left) - Number(right)) < 1e-8;
  }

  private async insertExecutionEvent(
    userId: string,
    copyEventId: string | null,
    status: ExecutionStatus,
    message: string,
    details: Record<string, unknown> | null,
    accountId: string | null,
    accountName: string | null,
    executionKey?: string | null,
  ) {
    const { error } = await this.databaseService
      .getClient()
      .from('execution_logs')
      .insert({
        user_id: userId,
        copy_event_id: copyEventId,
        account_id: accountId,
        account_name: accountName,
        execution_key: executionKey ?? null,
        status,
        message,
        details,
        attempt: 0,
      });

    if (error) {
      throw new Error(error.message);
    }
  }

  private isTradeExecutionUnchanged(
    existing: TradeExecutionRecord,
    candidate: {
      copy_event_id: string | null;
      entry_type: TradeExecutionRecord['entry_type'];
      account_id: string;
      account_name: string | null;
      ticket: string;
      symbol: string;
      type: 'BUY' | 'SELL';
      opening_order_type: 'BUY' | 'SELL';
      position_direction: 'LONG' | 'SHORT';
      close_reason: TradeExecutionRecord['close_reason'];
      volume: number;
      entry_price: number;
      exit_price: number | null;
      stop_loss: number | null;
      take_profit: number | null;
      profit: number;
      status: TradeExecutionRecord['status'];
      comment: string | null;
      opened_at: string;
      closed_at: string | null;
    },
  ) {
    return (
      existing.copy_event_id === candidate.copy_event_id &&
      existing.entry_type === candidate.entry_type &&
      existing.account_id === candidate.account_id &&
      (existing.account_name ?? null) === candidate.account_name &&
      existing.ticket === candidate.ticket &&
      existing.symbol === candidate.symbol &&
      existing.type === candidate.type &&
      existing.opening_order_type === candidate.opening_order_type &&
      existing.position_direction === candidate.position_direction &&
      existing.close_reason === candidate.close_reason &&
      existing.volume === candidate.volume &&
      existing.entry_price === candidate.entry_price &&
      existing.exit_price === candidate.exit_price &&
      existing.stop_loss === candidate.stop_loss &&
      existing.take_profit === candidate.take_profit &&
      existing.profit === candidate.profit &&
      existing.status === candidate.status &&
      (existing.comment ?? null) === candidate.comment &&
      existing.opened_at === candidate.opened_at &&
      existing.closed_at === candidate.closed_at
    );
  }

  private async getLatestStatusesByAccount(userId: string) {
    const { data, error } = await this.databaseService
      .getClient()
      .from('ea_account_status_snapshots')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(250);

    if (error) {
      throw new Error(error.message);
    }

    const result = new Map<string, AccountStatusDTO>();

    for (const snapshot of (data ?? []) as AccountStatusSnapshotRecord[]) {
      if (!result.has(snapshot.account_id)) {
        result.set(snapshot.account_id, this.toAccountStatusDto(snapshot));
      }
    }

    return result;
  }

  private tradeEventToExecutionStatus(status: EaTradeEventPayload['status']): ExecutionStatus {
    switch (status) {
      case 'OPEN':
        return 'TRADE_OPENED';
      case 'CLOSED':
        return 'TRADE_CLOSED';
      default:
        return 'TRADE_REJECTED';
    }
  }

  private tradeEventMessage(
    payload: EaTradeEventPayload,
    accountId: string,
    positionDirection: 'LONG' | 'SHORT',
  ) {
    switch (payload.status) {
      case 'OPEN':
        return `EA ${accountId} opened ${payload.symbol} ${positionDirection} ticket ${payload.ticket}`;
      case 'CLOSED':
        return `EA ${accountId} closed ${payload.symbol} ${positionDirection} ticket ${payload.ticket}`;
      default:
        return `EA ${accountId} rejected ${payload.symbol} ${positionDirection} ticket ${payload.ticket}`;
    }
  }

  private resolveOpeningOrderType(
    existing: TradeExecutionRecord | null,
    payload: EaTradeEventPayload,
  ): 'BUY' | 'SELL' {
    if (payload.opening_order_type === 'BUY' || payload.opening_order_type === 'SELL') {
      return payload.opening_order_type;
    }

    if (existing?.opening_order_type) {
      return existing.opening_order_type;
    }

    return payload.type;
  }

  private resolvePositionDirection(
    existing: TradeExecutionRecord | null,
    payload: EaTradeEventPayload,
  ): 'LONG' | 'SHORT' {
    if (payload.position_direction === 'LONG' || payload.position_direction === 'SHORT') {
      return payload.position_direction;
    }

    if (existing?.position_direction) {
      return existing.position_direction;
    }

    const openingOrderType = this.resolveOpeningOrderType(existing, payload);
    return openingOrderType === 'BUY' ? 'LONG' : 'SHORT';
  }

  private resolveCloseReason(
    existing: TradeExecutionRecord | null,
    payload: EaTradeEventPayload,
  ): TradeExecutionRecord['close_reason'] {
    if (payload.close_reason) {
      return payload.close_reason;
    }

    const comment = (payload.comment ?? existing?.comment ?? '').toUpperCase();

    if (comment.includes('BREAKEVEN') || comment.includes('BREAK EVEN') || comment.includes(' BE ')) {
      return 'BREAKEVEN';
    }
    if (comment.includes('PARTIAL')) {
      return 'PARTIAL';
    }
    if (comment.includes('TP') || comment.includes('TAKE PROFIT')) {
      return 'TP';
    }
    if (comment.includes('SL') || comment.includes('STOP LOSS')) {
      return 'SL';
    }
    if (comment.includes('MANUAL')) {
      return 'MANUAL';
    }

    if (payload.take_profit !== null && payload.exit_price !== null) {
      const distanceTp = Math.abs(payload.exit_price - payload.take_profit);
      if (distanceTp < 1e-4) {
        return 'TP';
      }
    }

    if (payload.stop_loss !== null && payload.exit_price !== null) {
      const distanceSl = Math.abs(payload.exit_price - payload.stop_loss);
      if (distanceSl < 1e-4) {
        return 'SL';
      }
    }

    return 'UNKNOWN';
  }

  private toAccountStatusDto(snapshot: AccountStatusSnapshotRecord): AccountStatusDTO {
    return accountStatusDtoSchema.parse({
      accountId: snapshot.account_id,
      accountName: snapshot.account_name,
      balance: snapshot.balance,
      equity: snapshot.equity,
      margin: snapshot.margin,
      freeMargin: snapshot.free_margin,
      drawdownPercent: snapshot.drawdown_percent,
      openPositions: snapshot.open_positions,
      reportedAt: snapshot.created_at,
    });
  }

  private sendMessage(client: WebSocket, message: WebSocketOutboundMessage) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  }

  private resolvePendingStateSync(requestId: string, accountId: string) {
    const pending = this.pendingStateSyncs.get(requestId);

    if (!pending) {
      return;
    }

    pending.pendingAccountIds.delete(accountId);

    if (pending.pendingAccountIds.size > 0) {
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingStateSyncs.delete(requestId);
    pending.resolve();
  }

  private tryParseJson(rawMessage: string) {
    try {
      return JSON.parse(rawMessage) as object;
    } catch {
      return null;
    }
  }
}
