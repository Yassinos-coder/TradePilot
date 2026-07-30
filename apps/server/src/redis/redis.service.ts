import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

type MessageHandler = (message: string) => void | Promise<void>;

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly redisUrl: string;
  private readonly client: Redis;
  private readonly publisher: Redis;
  private readonly subscriber: Redis;
  private readonly handlersByChannel = new Map<string, Set<MessageHandler>>();

  constructor(private readonly configService: ConfigService) {
    this.redisUrl = this.configService.getOrThrow<string>('REDIS_URL');
    this.client = this.createClient('command');
    this.publisher = this.createClient('publisher');
    this.subscriber = this.createClient('subscriber');

    this.subscriber.on('message', (channel, message) => {
      const handlers = this.handlersByChannel.get(channel);

      if (!handlers) {
        return;
      }

      for (const handler of handlers) {
        void handler(message);
      }
    });
  }

  getClient() {
    return this.client;
  }

  async ping(): Promise<boolean> {
    try {
      return (await this.client.ping()) === 'PONG';
    } catch (error) {
      this.logger.warn(`Redis ping failed: ${String(error)}`);
      return false;
    }
  }

  async publish(channel: string, payload: string) {
    await this.publisher.publish(channel, payload);
  }

  async subscribe(channel: string, handler: MessageHandler) {
    const existingHandlers = this.handlersByChannel.get(channel);

    if (existingHandlers) {
      existingHandlers.add(handler);
    } else {
      this.handlersByChannel.set(channel, new Set([handler]));
      await this.subscriber.subscribe(channel);
    }

    return async () => {
      const handlers = this.handlersByChannel.get(channel);

      if (!handlers) {
        return;
      }

      handlers.delete(handler);

      if (handlers.size === 0) {
        this.handlersByChannel.delete(channel);
        await this.subscriber.unsubscribe(channel);
      }
    };
  }

  /**
   * Subscribes, then runs `trigger`, then waits for the first message.
   *
   * The subscribe is awaited before the trigger fires, which matters because
   * publisher and subscriber are often the same process: a reply can land in
   * well under a millisecond, so subscribing lazily loses it and the caller
   * times out on an operation that actually succeeded. Taking the trigger as a
   * callback makes that ordering impossible to get wrong at the call site.
   */
  async awaitMessageAfter(
    channel: string,
    timeoutMs: number,
    trigger: () => Promise<void>,
  ): Promise<string | null> {
    const subscriber = this.createClient(`await:${channel}`);

    const teardown = async () => {
      try {
        await subscriber.unsubscribe(channel);
      } catch {
        // Ignore unsubscribe failures during teardown.
      }

      await subscriber.quit();
    };

    let resolveMessage: (value: string | null) => void = () => undefined;
    const message = new Promise<string | null>((resolve) => {
      resolveMessage = resolve;
    });

    const onMessage = (incomingChannel: string, payload: string) => {
      if (incomingChannel === channel) {
        resolveMessage(payload);
      }
    };

    subscriber.on('message', onMessage);

    try {
      await subscriber.subscribe(channel);
    } catch (error) {
      subscriber.off('message', onMessage);
      await teardown();
      throw error;
    }

    const timeoutId = setTimeout(() => resolveMessage(null), timeoutMs);

    try {
      await trigger();
      return await message;
    } finally {
      clearTimeout(timeoutId);
      subscriber.off('message', onMessage);
      await teardown();
    }
  }

  async waitForMessage(channel: string, timeoutMs: number): Promise<string | null> {
    const temporarySubscriber = this.createClient(`temp:${channel}`);

    return new Promise((resolve, reject) => {
      const finish = async (value: string | null, error?: unknown) => {
        clearTimeout(timeoutId);
        temporarySubscriber.off('message', onMessage);

        try {
          await temporarySubscriber.unsubscribe(channel);
        } catch {
          // Ignore unsubscribe failures during teardown.
        }

        await temporarySubscriber.quit();

        if (error) {
          reject(error);
          return;
        }

        resolve(value);
      };

      const onMessage = (incomingChannel: string, message: string) => {
        if (incomingChannel === channel) {
          void finish(message);
        }
      };

      const timeoutId = setTimeout(() => {
        void finish(null);
      }, timeoutMs);

      temporarySubscriber.on('message', onMessage);
      temporarySubscriber
        .subscribe(channel)
        .catch((error) => void finish(null, error));
    });
  }

  async setJson(key: string, value: unknown, ttlMs: number) {
    await this.client.set(key, JSON.stringify(value), 'PX', ttlMs);
  }

  async delete(key: string) {
    await this.client.del(key);
  }

  async scanKeys(pattern: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor = '0';

    do {
      const [nextCursor, batch] = await this.client.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        '100',
      );

      cursor = nextCursor;
      keys.push(...batch);
    } while (cursor !== '0');

    return keys;
  }

  async getMany(keys: string[]): Promise<Array<string | null>> {
    if (keys.length === 0) {
      return [];
    }

    return this.client.mget(keys);
  }

  async onModuleDestroy() {
    await Promise.allSettled([
      this.client.quit(),
      this.publisher.quit(),
      this.subscriber.quit(),
    ]);
  }

  private createClient(role: string) {
    const client = new Redis(this.redisUrl, {
      maxRetriesPerRequest: null,
      lazyConnect: false,
      enableReadyCheck: true,
    });

    client.on('error', (error) => {
      this.logger.warn(`Redis ${role} client error: ${String(error)}`);
    });

    return client;
  }
}
