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
  EA_PRESENCE_KEY_PREFIX,
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

import { DatabaseService } from '../database/database.service';
import {
  AccountStatusSnapshotRecord,
  ExecutionStatus,
  SignalStatus,
  TradeExecutionRecord,
} from '../database/database.types';
import { RedisService } from '../redis/redis.service';
import { UsersService } from '../users/users.service';

import {
  DispatchAckMessage,
  DispatchEventMessage,
  EaConnectionAccountState,
  EaConnectionState,
} from '../execution/execution.types';

interface SocketMetadata {
  connectionId: string;
  userId?: string;
  accountId?: string;
  accountName?: string;
  lastSeenAt: number;
  latencyMs: number | null;
  lastServerPingAt: number | null;
}

interface PresencePayload {
  connectionId: string;
  instanceId: string;
  accountId: string;
  accountName: string | null;
  lastSeenAt: number;
  latencyMs: number | null;
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
  private readonly pendingStateSyncs = new Map<string, PendingStateSync>();
  private readonly inFlightStateSyncs = new Map<string, Promise<void>>();
  private readonly recentStateSyncs = new Map<string, number>();
  private attached = false;
  private unsubscribeDispatch?: () => Promise<void>;

  constructor(
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly databaseService: DatabaseService,
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
    const presenceKeys = await this.redisService.scanKeys(
      `${EA_PRESENCE_KEY_PREFIX}:${userId}:*`,
    );
    const values = await this.redisService.getMany(presenceKeys);
    const presences = values
      .map((value) => {
        if (!value) {
          return null;
        }

        try {
          return JSON.parse(value) as PresencePayload;
        } catch {
          return null;
        }
      })
      .filter((value): value is PresencePayload => Boolean(value));

    const latestStatuses = await this.getLatestStatusesByAccount(userId);

    return presences
      .sort((left, right) => right.lastSeenAt - left.lastSeenAt)
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

    client.on('message', async (buffer) => {
      try {
        await this.handleMessage(client, buffer.toString());
      } catch (error) {
        this.logger.warn(`EA message handling failed: ${String(error)}`);
      }
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
      this.sendMessage(client, {
        type: 'error',
        message: 'Unsupported WebSocket message',
      });
      return;
    }

    const message: WebSocketInboundMessage = parsedMessage.data;
    await this.touch(client);

    if (message.type === 'auth') {
      const user = await this.usersService.findByApiKey(message.apiKey);

      if (!user) {
        this.sendMessage(client, {
          type: 'error',
          message: 'Invalid API key',
        });
        client.close();
        return;
      }

      await this.registerSocket(client, user.id, message.accountId, message.accountName);
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
    await this.upsertEaAccount(userId, accountId, accountName, metadata.latencyMs, metadata.lastSeenAt);
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
    await this.redisService.setJson(
      this.getPresenceKey(metadata.userId, metadata.accountId),
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

      if (connections) {
        connections.delete(metadata.accountId);

        if (connections.size === 0) {
          this.socketsByUser.delete(metadata.userId);
        }
      }

      await this.redisService.delete(
        this.getPresenceKey(metadata.userId, metadata.accountId),
      );
    }

    this.socketMetadata.delete(client);
  }

  private async upsertEaAccount(
    userId: string,
    accountId: string,
    accountName: string,
    latencyMs: number | null,
    lastSeenAt: number,
  ) {
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
    const openingOrderType = this.resolveOpeningOrderType(existingRecord, payload);
    const positionDirection = this.resolvePositionDirection(existingRecord, payload);
    const closeReason =
      payload.status === 'CLOSED'
        ? this.resolveCloseReason(existingRecord, payload)
        : existingRecord?.close_reason ?? null;

    const record = {
      user_id: userId,
      signal_id: payload.signal_id ?? null,
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

    if (payload.signal_id && payload.status === 'OPEN') {
      await this.updateSignalStatus(payload.signal_id, 'EXECUTED').catch(() => undefined);
    }
  }

  private async storeCommandResult(
    userId: string,
    accountId: string,
    accountName: string | null,
    payload: Extract<WebSocketInboundMessage, { type: 'command_result' }>,
  ) {
    await this.insertExecutionEvent(
      userId,
      payload.signal_id ?? null,
      payload.status === 'SUCCESS' ? 'COMMAND_SUCCEEDED' : 'COMMAND_FAILED',
      payload.message,
      {
        accountId,
        accountName,
        action: payload.action,
        symbol: payload.symbol,
        executionKey: payload.execution_key,
        details: payload.details ?? null,
      },
      accountId,
      accountName,
      payload.execution_key ?? null,
    );
  }

  private async insertExecutionEvent(
    userId: string,
    signalId: string | null,
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
        signal_id: signalId,
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
      signal_id: string | null;
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
      existing.signal_id === candidate.signal_id &&
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
    if (existing?.opening_order_type) {
      return existing.opening_order_type;
    }

    if (payload.opening_order_type === 'BUY' || payload.opening_order_type === 'SELL') {
      return payload.opening_order_type;
    }

    return payload.type;
  }

  private resolvePositionDirection(
    existing: TradeExecutionRecord | null,
    payload: EaTradeEventPayload,
  ): 'LONG' | 'SHORT' {
    if (existing?.position_direction) {
      return existing.position_direction;
    }

    if (payload.position_direction === 'LONG' || payload.position_direction === 'SHORT') {
      return payload.position_direction;
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

  private async updateSignalStatus(signalId: string, status: SignalStatus) {
    const { error } = await this.databaseService
      .getClient()
      .from('signals')
      .update({ status })
      .eq('id', signalId);

    if (error) {
      throw new Error(error.message);
    }
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

  private getPresenceKey(userId: string, accountId: string) {
    return `${EA_PRESENCE_KEY_PREFIX}:${userId}:${accountId}`;
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
