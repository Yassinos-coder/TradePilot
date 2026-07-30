import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import {
  API_KEY_DISPLAY_PREFIX_LENGTH,
  API_KEY_PREFIX_EA,
  API_KEY_PREFIX_REST,
} from '@tradepilot/config';
import {
  ApiKeyDTO,
  ApiKeySecretResult,
  CreateApiKeyInput,
  RotateApiKeyInput,
  apiKeySecretResultSchema,
} from '@tradepilot/shared';

import { ApiKeyKind, ApiKeyRecord } from '../../database/database.types';
import { ApiKeyMapper } from '../mappers/api-key.mapper';
import { ApiKeyRepository } from '../repositories/api-key.repository';

export interface ResolvedApiKey {
  userId: string;
  keyId: string;
  kind: ApiKeyKind;
  scopes: string[];
  hmacSecret: string | null;
}

@Injectable()
export class ApiKeysService {
  private readonly logger = new Logger(ApiKeysService.name);
  /** keyId → epoch ms of the last last_used_at write, to avoid a write per request. */
  private readonly lastUsedWrites = new Map<string, number>();

  constructor(
    private readonly apiKeyRepository: ApiKeyRepository,
    private readonly configService: ConfigService,
  ) {}

  static hashSecret(secret: string): string {
    return createHash('sha256').update(secret).digest('hex');
  }

  async listKeys(userId: string): Promise<ApiKeyDTO[]> {
    const records = await this.apiKeyRepository.listByUser(userId);
    return records.map((record) => ApiKeyMapper.toDto(record));
  }

  async createKey(userId: string, input: CreateApiKeyInput): Promise<ApiKeySecretResult> {
    return this.mintKey(userId, input.kind, input.name, input.requireHmac, null);
  }

  async rotateKey(
    userId: string,
    keyId: string,
    input: RotateApiKeyInput,
  ): Promise<ApiKeySecretResult> {
    const existing = await this.apiKeyRepository.findById(userId, keyId);

    if (!existing) {
      throw new NotFoundException('API key was not found');
    }

    const successor = await this.mintKey(
      userId,
      existing.kind,
      existing.name,
      Boolean(existing.hmac_secret),
      existing.id,
    );

    // A grace window keeps a live EA session authenticating while the terminal
    // is reconfigured. graceHours of 0 revokes the old key immediately.
    if (input.graceHours <= 0) {
      await this.apiKeyRepository.revoke(existing.id);
    } else {
      const expiresAt = new Date(Date.now() + input.graceHours * 3_600_000).toISOString();
      await this.apiKeyRepository.setExpiry(existing.id, expiresAt);
    }

    return successor;
  }

  async revokeKey(userId: string, keyId: string): Promise<void> {
    const existing = await this.apiKeyRepository.findById(userId, keyId);

    if (!existing) {
      throw new NotFoundException('API key was not found');
    }

    await this.apiKeyRepository.revoke(existing.id);
  }

  /** Returns null for unknown, revoked or expired keys. */
  async resolveKey(secret: string, kind: ApiKeyKind): Promise<ResolvedApiKey | null> {
    const trimmed = secret.trim();

    if (!trimmed) {
      return null;
    }

    const record = await this.apiKeyRepository.findLiveByHash(
      ApiKeysService.hashSecret(trimmed),
      kind,
    );

    if (!record || this.isExpired(record)) {
      return null;
    }

    void this.recordUsage(record.id);

    return {
      userId: record.user_id,
      keyId: record.id,
      kind: record.kind,
      scopes: record.scopes ?? [],
      hmacSecret: record.hmac_secret,
    };
  }

  static safeCompare(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
  }

  private async mintKey(
    userId: string,
    kind: ApiKeyKind,
    name: string,
    requireHmac: boolean,
    rotatedFromId: string | null,
  ): Promise<ApiKeySecretResult> {
    const prefix = kind === 'EA' ? API_KEY_PREFIX_EA : API_KEY_PREFIX_REST;
    const secret = `${prefix}_${randomBytes(24).toString('hex')}`;
    const hmacSecret = requireHmac ? randomBytes(32).toString('hex') : null;

    const record = await this.apiKeyRepository.insert({
      userId,
      kind,
      name,
      prefix: secret.slice(0, API_KEY_DISPLAY_PREFIX_LENGTH),
      keyHash: ApiKeysService.hashSecret(secret),
      hmacSecret,
      rotatedFromId,
    });

    return apiKeySecretResultSchema.parse({
      key: ApiKeyMapper.toDto(record),
      secret,
      hmacSecret,
    });
  }

  private isExpired(record: ApiKeyRecord): boolean {
    if (!record.expires_at) {
      return false;
    }

    return new Date(record.expires_at).getTime() <= Date.now();
  }

  private async recordUsage(keyId: string): Promise<void> {
    const throttleMs =
      this.configService.get<number>('API_KEY_LAST_USED_THROTTLE_MS') ?? 60_000;
    const lastWrite = this.lastUsedWrites.get(keyId) ?? 0;

    if (Date.now() - lastWrite < throttleMs) {
      return;
    }

    this.lastUsedWrites.set(keyId, Date.now());

    try {
      await this.apiKeyRepository.touchLastUsed(keyId);
    } catch (error) {
      // Usage tracking is best-effort; never fail a request over it.
      this.logger.warn(`Could not record API key usage: ${String(error)}`);
    }
  }
}
