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

import { DatabaseService } from '../database/database.service';
import {
  AccountStatusSnapshotRecord,
  ExecutionStatus,
  TradeExecutionRecord,
} from '../database/database.types';
import { RedisService } from '../redis/redis.service';
import { UsersService } from '../users/users.service';

import {
  DispatchAckMessage,
  DispatchEventMessage,
  EaConnectionState,
} from '../execution/execution.types';

interface SocketMetadata {
  connectionId: string;
  userId?: string;
  lastSeenAt: number;
  latencyMs: number | null;
  lastServerPingAt: number | null;
}

interface PresencePayload {
  connectionId: string;
  instanceId: string;
  lastSeenAt: number;
  latencyMs: number | null;
}

@Injectable()
export class EaGatewayService implements OnModuleDestroy, OnModuleInit {
  private readonly logger = new Logger(EaGatewayService.name);
  private readonly instanceId = randomUUID();
  private server?: WebSocketServer;
  private heartbeatTimer?: NodeJS.Timeout;
  private readonly socketsByUser = new Map<string, Set<WebSocket>>();
  private readonly socketMetadata = new Map<WebSocket, SocketMetadata>();
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
      .filter((value): value is PresencePayload => Boolean(value))
      .sort((left, right) => right.lastSeenAt - left.lastSeenAt);

    const latest = presences[0];
    const accountStatus = await this.getLatestAccountStatus(userId);

    return {
      online: presences.length > 0,
      latencyMs: latest?.latencyMs ?? null,
      lastSeenAt: latest ? new Date(latest.lastSeenAt).toISOString() : null,
      connectionCount: presences.length,
      accountStatus,
    };
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

      await this.registerSocket(client, user.id);
      this.sendMessage(client, { type: 'auth_success' });
      return;
    }

    const metadata = this.socketMetadata.get(client);

    if (!metadata?.userId) {
      this.sendMessage(client, {
        type: 'error',
        message: 'Authenticate before sending heartbeat messages',
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

    if (message.type === 'account_status') {
      await this.storeAccountStatus(metadata.userId, message.data);
      return;
    }

    if (message.type === 'trade_event') {
      await this.storeTradeEvent(metadata.userId, message.data);
    }
  }

  private async handleDispatchEvent(rawMessage: string) {
    const payload = this.tryParseJson(rawMessage);

    if (!payload) {
      return;
    }

    const event = payload as DispatchEventMessage;
    const connections = this.socketsByUser.get(event.userId);

    if (!connections || connections.size === 0) {
      return;
    }

    const outboundMessage: WebSocketOutboundMessage = {
      type: 'signal',
      data: event.trades,
    };
    const serializedMessage = JSON.stringify(outboundMessage);
    let deliveredCount = 0;

    for (const connection of connections) {
      if (connection.readyState !== WebSocket.OPEN) {
        await this.removeConnection(connection);
        continue;
      }

      try {
        connection.send(serializedMessage);
        deliveredCount += 1;
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
        instanceId: this.instanceId,
        userId: event.userId,
      };

      await this.redisService.publish(
        `${EA_DISPATCH_ACK_PREFIX}:${event.eventId}`,
        JSON.stringify(ack),
      );
    }
  }

  private async registerSocket(client: WebSocket, userId: string) {
    const metadata = this.socketMetadata.get(client);

    if (!metadata) {
      return;
    }

    this.socketMetadata.set(client, {
      ...metadata,
      userId,
      lastSeenAt: Date.now(),
    });

    const existingConnections = this.socketsByUser.get(userId) ?? new Set<WebSocket>();
    existingConnections.add(client);
    this.socketsByUser.set(userId, existingConnections);
    await this.persistPresence(client);
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

        if (metadata.userId && socket.readyState === WebSocket.OPEN) {
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

    if (!metadata?.userId) {
      return;
    }

    const ttlMs = this.configService.get<number>('EA_PRESENCE_TTL_MS') ?? 18_000;

    await this.redisService.setJson(
      this.getPresenceKey(metadata.userId, metadata.connectionId),
      {
        connectionId: metadata.connectionId,
        instanceId: this.instanceId,
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

    if (metadata.userId) {
      const connections = this.socketsByUser.get(metadata.userId);

      if (connections) {
        connections.delete(client);

        if (connections.size === 0) {
          this.socketsByUser.delete(metadata.userId);
        }
      }

      await this.redisService.delete(
        this.getPresenceKey(metadata.userId, metadata.connectionId),
      );
    }

    this.socketMetadata.delete(client);
  }

  private async storeAccountStatus(userId: string, payload: EaAccountStatusPayload) {
    const { data, error } = await this.databaseService
      .getClient()
      .from('ea_account_status_snapshots')
      .insert({
        user_id: userId,
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
        balance: payload.balance,
        equity: payload.equity,
        drawdownPercent: payload.drawdownPercent,
        openPositions: payload.openPositions,
      },
    );
  }

  private async storeTradeEvent(userId: string, payload: EaTradeEventPayload) {
    const { error } = await this.databaseService
      .getClient()
      .from('trade_executions')
      .upsert(
        {
          user_id: userId,
          signal_id: payload.signal_id ?? null,
          ticket: payload.ticket,
          symbol: payload.symbol,
          type: payload.type,
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
        },
        {
          onConflict: 'user_id,ticket',
        },
      );

    if (error) {
      throw new Error(error.message);
    }

    const status = this.tradeEventToExecutionStatus(payload.status);
    const message = this.tradeEventMessage(payload);

    await this.insertExecutionEvent(userId, payload.signal_id ?? null, status, message, {
      ticket: payload.ticket,
      symbol: payload.symbol,
      volume: payload.volume,
      profit: payload.profit,
      status: payload.status,
      openedAt: payload.opened_at,
      closedAt: payload.closed_at,
    });
  }

  private async insertExecutionEvent(
    userId: string,
    signalId: string | null,
    status: ExecutionStatus,
    message: string,
    details: Record<string, unknown> | null,
  ) {
    const { error } = await this.databaseService
      .getClient()
      .from('execution_logs')
      .insert({
        user_id: userId,
        signal_id: signalId,
        status,
        message,
        details,
        attempt: 0,
      });

    if (error) {
      throw new Error(error.message);
    }
  }

  private async getLatestAccountStatus(userId: string): Promise<AccountStatusDTO | null> {
    const { data, error } = await this.databaseService
      .getClient()
      .from('ea_account_status_snapshots')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      return null;
    }

    return this.toAccountStatusDto(data as AccountStatusSnapshotRecord);
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

  private tradeEventMessage(payload: EaTradeEventPayload) {
    switch (payload.status) {
      case 'OPEN':
        return `EA opened ${payload.symbol} ${payload.type} ticket ${payload.ticket}`;
      case 'CLOSED':
        return `EA closed ${payload.symbol} ${payload.type} ticket ${payload.ticket}`;
      default:
        return `EA rejected ${payload.symbol} ${payload.type} ticket ${payload.ticket}`;
    }
  }

  private toAccountStatusDto(snapshot: AccountStatusSnapshotRecord): AccountStatusDTO {
    return accountStatusDtoSchema.parse({
      balance: snapshot.balance,
      equity: snapshot.equity,
      margin: snapshot.margin,
      freeMargin: snapshot.free_margin,
      drawdownPercent: snapshot.drawdown_percent,
      openPositions: snapshot.open_positions,
      reportedAt: snapshot.created_at,
    });
  }

  private getPresenceKey(userId: string, connectionId: string) {
    return `${EA_PRESENCE_KEY_PREFIX}:${userId}:${connectionId}`;
  }

  private sendMessage(client: WebSocket, message: WebSocketOutboundMessage) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  }

  private tryParseJson(rawMessage: string) {
    try {
      return JSON.parse(rawMessage) as object;
    } catch {
      return null;
    }
  }
}
