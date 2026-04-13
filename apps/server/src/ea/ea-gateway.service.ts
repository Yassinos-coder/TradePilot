import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IncomingMessage, Server as HttpServer } from 'node:http';
import { Server as WebSocketServer, WebSocket } from 'ws';

import { EA_WEBSOCKET_PATH } from '@tradepilot/config';
import {
  SignalDTO,
  WebSocketInboundMessage,
  WebSocketOutboundMessage,
  eaInboundMessageSchema,
} from '@tradepilot/shared';
import { toEaSignalPayload } from '@tradepilot/trading';

import { UsersService } from '../users/users.service';

interface SocketMetadata {
  userId?: string;
  lastSeenAt: number;
}

@Injectable()
export class EaGatewayService implements OnModuleDestroy {
  private readonly logger = new Logger(EaGatewayService.name);
  private server?: WebSocketServer;
  private heartbeatTimer?: NodeJS.Timeout;
  private readonly socketsByUser = new Map<string, Set<WebSocket>>();
  private readonly socketMetadata = new Map<WebSocket, SocketMetadata>();
  private attached = false;

  constructor(
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
  ) {}

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

    this.startHeartbeatMonitor();
    this.attached = true;
  }

  async sendSignal(userId: string, signal: SignalDTO): Promise<boolean> {
    const connections = this.socketsByUser.get(userId);

    if (!connections || connections.size === 0) {
      return false;
    }

    const outboundMessage: WebSocketOutboundMessage = {
      type: 'signal',
      data: toEaSignalPayload(signal),
    };

    const payload = JSON.stringify(outboundMessage);
    let delivered = false;

    for (const connection of connections) {
      if (connection.readyState !== WebSocket.OPEN) {
        this.removeConnection(connection);
        continue;
      }

      try {
        connection.send(payload);
        delivered = true;
      } catch (error) {
        this.logger.warn(`Failed to send signal to connection: ${String(error)}`);
        this.removeConnection(connection);
      }
    }

    return delivered;
  }

  isConnected(userId: string): boolean {
    const connections = this.socketsByUser.get(userId);
    return Boolean(connections && connections.size > 0);
  }

  onModuleDestroy() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    this.server?.close();
  }

  private handleConnection(client: WebSocket, _request: IncomingMessage) {
    this.socketMetadata.set(client, {
      lastSeenAt: Date.now(),
    });

    client.on('message', async (buffer) => {
      await this.handleMessage(client, buffer.toString());
    });

    client.on('close', () => {
      this.removeConnection(client);
    });

    client.on('error', (error) => {
      this.logger.warn(`EA connection error: ${String(error)}`);
      this.removeConnection(client);
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
    this.touch(client);

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

      this.registerSocket(client, user.id);
      this.sendMessage(client, { type: 'auth_success' });
      return;
    }

    if (!this.socketMetadata.get(client)?.userId) {
      this.sendMessage(client, {
        type: 'error',
        message: 'Authenticate before sending heartbeat messages',
      });
      return;
    }

    if (message.type === 'ping') {
      this.sendMessage(client, { type: 'pong' });
    }
  }

  private registerSocket(client: WebSocket, userId: string) {
    const metadata = this.socketMetadata.get(client);

    this.socketMetadata.set(client, {
      ...metadata,
      userId,
      lastSeenAt: Date.now(),
    });

    const existingConnections = this.socketsByUser.get(userId) ?? new Set<WebSocket>();
    existingConnections.add(client);
    this.socketsByUser.set(userId, existingConnections);
  }

  private touch(client: WebSocket) {
    const metadata = this.socketMetadata.get(client);
    if (!metadata) {
      return;
    }

    this.socketMetadata.set(client, {
      ...metadata,
      lastSeenAt: Date.now(),
    });
  }

  private startHeartbeatMonitor() {
    const timeoutMs = this.configService.get<number>('EA_HEARTBEAT_TIMEOUT_MS') ?? 30000;

    this.heartbeatTimer = setInterval(() => {
      const threshold = Date.now() - timeoutMs;

      for (const [socket, metadata] of this.socketMetadata.entries()) {
        if (metadata.lastSeenAt < threshold) {
          socket.close();
          this.removeConnection(socket);
        }
      }
    }, 5000);
  }

  private removeConnection(client: WebSocket) {
    const metadata = this.socketMetadata.get(client);

    if (metadata?.userId) {
      const connections = this.socketsByUser.get(metadata.userId);

      if (connections) {
        connections.delete(client);

        if (connections.size === 0) {
          this.socketsByUser.delete(metadata.userId);
        }
      }
    }

    this.socketMetadata.delete(client);
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
