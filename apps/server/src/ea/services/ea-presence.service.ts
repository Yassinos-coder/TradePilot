import { Injectable } from '@nestjs/common';

import { EA_PRESENCE_KEY_PREFIX } from '@tradepilot/config';

import { RedisService } from '../../redis/redis.service';

export interface PresencePayload {
  connectionId: string;
  instanceId: string;
  accountId: string;
  accountName: string | null;
  lastSeenAt: number;
  latencyMs: number | null;
}

/**
 * Owns the Redis presence keys for connected EAs.
 *
 * Extracted from the gateway so the copier can ask "is this slave online?"
 * without importing the gateway, which imports the copier.
 */
@Injectable()
export class EaPresenceService {
  constructor(private readonly redisService: RedisService) {}

  async set(userId: string, payload: PresencePayload, ttlMs: number): Promise<void> {
    await this.redisService.setJson(this.buildKey(userId, payload.accountId), payload, ttlMs);
  }

  async remove(userId: string, accountId: string): Promise<void> {
    await this.redisService.delete(this.buildKey(userId, accountId));
  }

  async list(userId: string): Promise<PresencePayload[]> {
    const keys = await this.redisService.scanKeys(`${EA_PRESENCE_KEY_PREFIX}:${userId}:*`);
    const values = await this.redisService.getMany(keys);

    return values
      .map((value) => this.tryParse(value))
      .filter((value): value is PresencePayload => value !== null)
      .sort((left, right) => right.lastSeenAt - left.lastSeenAt);
  }

  async isOnline(userId: string, accountId: string): Promise<boolean> {
    const presences = await this.list(userId);
    return presences.some((presence) => presence.accountId === accountId);
  }

  async listOnlineAccountIds(userId: string): Promise<Set<string>> {
    const presences = await this.list(userId);
    return new Set(presences.map((presence) => presence.accountId));
  }

  private buildKey(userId: string, accountId: string): string {
    return `${EA_PRESENCE_KEY_PREFIX}:${userId}:${accountId}`;
  }

  private tryParse(value: string | null): PresencePayload | null {
    if (!value) {
      return null;
    }

    try {
      return JSON.parse(value) as PresencePayload;
    } catch {
      return null;
    }
  }
}
