import { ApiKeyDTO, apiKeySchema } from '@tradepilot/shared';

import { ApiKeyRecord } from '../../database/database.types';

export class ApiKeyMapper {
  /** Never exposes key_hash or hmac_secret. */
  static toDto(record: ApiKeyRecord): ApiKeyDTO {
    return apiKeySchema.parse({
      id: record.id,
      kind: record.kind,
      name: record.name,
      prefix: record.prefix,
      scopes: record.scopes ?? [],
      lastUsedAt: record.last_used_at,
      expiresAt: record.expires_at,
      revokedAt: record.revoked_at,
      rotatedFromId: record.rotated_from_id,
      createdAt: record.created_at,
    });
  }
}
