import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { UserDTO } from '@tradepilot/shared';

import { DatabaseService } from '../database/database.service';
import { TradeExecutionRecord } from '../database/database.types';
import { CacheService } from '../redis/cache.service';
import { UsersService } from '../users/users.service';
import { RequestUser } from './types/request-user.type';

interface AuthRequestContext {
  ipAddress?: string | null;
  userAgent?: string | null;
  deviceId?: string | null;
}

export interface RefreshedAuthSession {
  accessToken: string;
  refreshToken?: string;
}

function getSessionIdFromJwt(token: string): string | null {
  const parts = token.split('.');

  if (parts.length < 2 || !parts[1]) {
    return null;
  }

  try {
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const payload = JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as {
      session_id?: unknown;
    };

    return typeof payload.session_id === 'string' ? payload.session_id : null;
  } catch {
    return null;
  }
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private static readonly TRADE_CACHE_TTL_MS = 6 * 60 * 60 * 1_000;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly cacheService: CacheService,
    private readonly usersService: UsersService,
  ) {}

  /** Loads durable trade history into Redis once when a browser session is established. */
  async warmTradeHistoryCache(userId: string): Promise<void> {
    const { data, error } = await this.databaseService
      .getClient()
      .from('trade_executions')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(5_000);

    if (error) {
      this.logger.warn(`Could not warm trade cache for user ${userId}: ${error.message}`);
      return;
    }

    await this.cacheService.set(
      `tradepilot:cache:trades:${userId}`,
      (data ?? []) as TradeExecutionRecord[],
      AuthService.TRADE_CACHE_TTL_MS,
    );
  }

  async authenticateAccessToken(
    accessToken: string,
    context?: AuthRequestContext,
  ): Promise<RequestUser> {
    const { data, error } = await this.databaseService.getClient().auth.getUser(accessToken);

    if (error || !data.user || !data.user.email) {
      throw new UnauthorizedException('Invalid or expired Supabase session');
    }

    const user = await this.usersService.ensureAuthUser(data.user.id, data.user.email);
    const sessionId = getSessionIdFromJwt(accessToken);

    if (sessionId) {
      await this.usersService.upsertSession({
        userId: user.id,
        authSessionId: sessionId,
        deviceId: context?.deviceId ?? null,
        userAgent: context?.userAgent ?? null,
        ipAddress: context?.ipAddress ?? null,
      });
    }

    return {
      userId: user.id,
      authUserId: data.user.id,
      email: user.email,
      accessToken,
      sessionId,
      ipAddress: context?.ipAddress ?? null,
      userAgent: context?.userAgent ?? null,
    };
  }

  async refreshSession(refreshToken: string): Promise<RefreshedAuthSession> {
    const { data, error } = await this.databaseService.createAuthClient().auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error || !data.session?.access_token) {
      throw new UnauthorizedException('Invalid or expired Supabase session');
    }

    return {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token ?? refreshToken,
    };
  }

  async getCurrentUser(accessToken: string): Promise<UserDTO> {
    const requestUser = await this.authenticateAccessToken(accessToken);
    return this.usersService.getProfile(requestUser.userId);
  }

  async getCurrentUserFromRequest(user: RequestUser): Promise<UserDTO> {
    return this.usersService.getProfile(user.userId);
  }
}
