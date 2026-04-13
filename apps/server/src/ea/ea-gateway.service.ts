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
  EA_DISPATCH_ACK_PREFIX,
  EA_DISPATCH_CHANNEL,
  EA_PRESENCE_KEY_PREFIX,
  EA_WEBSOCKET_PATH,
} from '@tradepilot/config';
import {
  WebSocketInboundMessage,
  WebSocketOutboundMessage,
  eaInboundMessageSchema,
} from '@tradepilot/shared';
import { toEaSignalPayload } from '@tradepilot/trading';

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

    return {
      online: presences.length > 0,
      latencyMs: latest?.latencyMs ?? null,
      lastSeenAt: latest ? new Date(latest.lastSeenAt).toISOString() : null,
      connectionCount: presences.length,
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
      await this.handleMessage(client, buffer.toString());
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
      data: toEaSignalPayload(event.signal),
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
    const timeoutMs = this.configService.get<number>('EA_HEARTBEAT_TIMEOUT_MS') ?? 30_000;
    const pingIntervalMs =
      this.configService.get<number>('EA_SERVER_PING_INTERVAL_MS') ?? 10_000;

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

    const ttlMs = this.configService.get<number>('EA_PRESENCE_TTL_MS') ?? 45_000;

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
