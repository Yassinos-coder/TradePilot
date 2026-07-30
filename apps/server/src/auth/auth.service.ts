import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UserDTO } from '@tradepilot/shared';

import { DatabaseService } from '../database/database.service';
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
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly usersService: UsersService,
  ) {}

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
    const { data, error } = await this.databaseService.getClient().auth.refreshSession({
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
