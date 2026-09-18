import { Injectable, InternalServerErrorException } from '@nestjs/common';

import { DatabaseService } from '../../database/database.service';
import { ApiKeyKind, ApiKeyRecord } from '../../database/database.types';

@Injectable()
export class ApiKeyRepository {
  private readonly tableName = 'api_keys';

  constructor(private readonly databaseService: DatabaseService) {}

  async findById(userId: string, keyId: string): Promise<ApiKeyRecord | null> {
    const { data, error } = await this.databaseService
      .getClient()
      .from(this.tableName)
      .select('*')
      .eq('id', keyId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(`Failed to load API key: ${error.message}`);
    }

    return (data as ApiKeyRecord | null) ?? null;
  }

  /** Resolves a presented secret by hash. Callers still check expiry. */
  async findLiveByHash(keyHash: string, kind: ApiKeyKind): Promise<ApiKeyRecord | null> {
    const { data, error } = await this.databaseService
      .getClient()
      .from(this.tableName)
      .select('*')
      .eq('key_hash', keyHash)
      .eq('kind', kind)
      .is('revoked_at', null)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(`Failed to resolve API key: ${error.message}`);
    }

    return (data as ApiKeyRecord | null) ?? null;
  }

  async listByUser(userId: string): Promise<ApiKeyRecord[]> {
    const { data, error } = await this.databaseService
      .getClient()
      .from(this.tableName)
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new InternalServerErrorException(`Failed to list API keys: ${error.message}`);
    }

    return (data ?? []) as ApiKeyRecord[];
  }

  async insert(payload: {
    userId: string;
    kind: ApiKeyKind;
    name: string;
    prefix: string;
    keyHash: string;
    hmacSecret: string | null;
    rotatedFromId: string | null;
  }): Promise<ApiKeyRecord> {
    const { data, error } = await this.databaseService
      .getClient()
      .from(this.tableName)
      .insert({
        user_id: payload.userId,
        kind: payload.kind,
        name: payload.name,
        prefix: payload.prefix,
        key_hash: payload.keyHash,
        hmac_secret: payload.hmacSecret,
        rotated_from_id: payload.rotatedFromId,
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new InternalServerErrorException(
        `Failed to create API key: ${error?.message ?? 'no row returned'}`,
      );
    }

    return data as ApiKeyRecord;
  }

  async setExpiry(keyId: string, expiresAt: string | null): Promise<void> {
    const { error } = await this.databaseService
      .getClient()
      .from(this.tableName)
      .update({ expires_at: expiresAt })
      .eq('id', keyId);

    if (error) {
      throw new InternalServerErrorException(`Failed to set key expiry: ${error.message}`);
    }
  }

  async revoke(keyId: string): Promise<void> {
    const { error } = await this.databaseService
      .getClient()
      .from(this.tableName)
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', keyId);

    if (error) {
      throw new InternalServerErrorException(`Failed to revoke API key: ${error.message}`);
    }
  }

  async touchLastUsed(keyId: string): Promise<void> {
    const { error } = await this.databaseService
      .getClient()
      .from(this.tableName)
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', keyId);

    if (error) {
      throw new InternalServerErrorException(`Failed to record key usage: ${error.message}`);
    }
  }

  async delete(userId: string, keyId: string): Promise<void> {
    const { error } = await this.databaseService.getClient()
      .from(this.tableName).delete().eq('id', keyId).eq('user_id', userId);
    if (error) {
      throw new InternalServerErrorException(`Failed to delete API key: ${error.message}`);
    }
  }
}
