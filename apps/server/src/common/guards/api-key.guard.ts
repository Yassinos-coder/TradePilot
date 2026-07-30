import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, createHmac } from 'node:crypto';

import { ApiKeysService } from '../../api-keys/services/api-keys.service';

const NONCE_TTL_MS = 10 * 60 * 1000;
const TIMESTAMP_SKEW_MS = 5 * 60 * 1000;

export interface ApiKeyRequestContext {
  userId: string;
  keyId: string;
  scopes: string[];
}

/** Minimal request shape, matching how JwtAuthGuard avoids an @types/express dependency. */
export interface ApiKeyRequest {
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  apiKey?: ApiKeyRequestContext;
}

/**
 * Authenticates REST API keys presented as `x-api-key` or
 * `Authorization: Bearer tp_sk_…`.
 *
 * When the key was created with `requireHmac`, the request must additionally
 * carry a timestamp, a single-use nonce and a signature over
 * `<timestamp>.<nonce>.<sha256(body)>`, which stops replay of a captured call.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly seenNonces = new Map<string, number>();

  constructor(private readonly apiKeysService: ApiKeysService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ApiKeyRequest>();
    const presented = this.readKey(request);

    if (!presented) {
      throw new UnauthorizedException('Missing API key');
    }

    const resolved = await this.apiKeysService.resolveKey(presented, 'REST');

    if (!resolved) {
      throw new UnauthorizedException('Invalid, expired or revoked API key');
    }

    if (resolved.hmacSecret) {
      this.verifySignature(request, resolved.hmacSecret);
    }

    request.apiKey = {
      userId: resolved.userId,
      keyId: resolved.keyId,
      scopes: resolved.scopes,
    };

    return true;
  }

  private readKey(request: ApiKeyRequest): string | null {
    const headerKey = request.headers['x-api-key'];

    if (typeof headerKey === 'string' && headerKey.trim()) {
      return headerKey.trim();
    }

    const authorization = request.headers.authorization;

    if (typeof authorization === 'string' && authorization.startsWith('Bearer ')) {
      return authorization.slice(7).trim();
    }

    return null;
  }

  private verifySignature(request: ApiKeyRequest, hmacSecret: string): void {
    const timestamp = this.readHeader(request, 'x-tradepilot-timestamp');
    const nonce = this.readHeader(request, 'x-tradepilot-nonce');
    const signature = this.readHeader(request, 'x-tradepilot-signature');

    if (!timestamp || !nonce || !signature) {
      throw new UnauthorizedException('Missing HMAC authentication headers');
    }

    const requestTime = Number(timestamp);

    if (!Number.isFinite(requestTime) || Math.abs(Date.now() - requestTime) > TIMESTAMP_SKEW_MS) {
      throw new UnauthorizedException('Expired request timestamp');
    }

    this.pruneNonces();

    if (this.seenNonces.has(nonce)) {
      throw new UnauthorizedException('Replay detected: nonce already used');
    }

    const bodyDigest = createHash('sha256')
      .update(this.stableStringify(request.body ?? {}))
      .digest('hex');
    const expected = createHmac('sha256', hmacSecret)
      .update(`${timestamp}.${nonce}.${bodyDigest}`)
      .digest('hex');

    if (!ApiKeysService.safeCompare(signature, expected)) {
      throw new UnauthorizedException('Invalid request signature');
    }

    this.seenNonces.set(nonce, Date.now() + NONCE_TTL_MS);
  }

  private readHeader(request: ApiKeyRequest, name: string): string | null {
    const value = request.headers[name];
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private pruneNonces(): void {
    const now = Date.now();

    for (const [nonce, expiresAt] of this.seenNonces.entries()) {
      if (expiresAt <= now) {
        this.seenNonces.delete(nonce);
      }
    }
  }

  /** Key order must not change the digest, so object keys are sorted. */
  private stableStringify(value: unknown): string {
    if (value === null || typeof value !== 'object') {
      return JSON.stringify(value) ?? 'null';
    }

    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stableStringify(item)).join(',')}]`;
    }

    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${this.stableStringify(record[key])}`)
      .join(',')}}`;
  }
}
