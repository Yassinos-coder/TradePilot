import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { RequestUser } from '../../auth/types/request-user.type';
import { AuthService } from '../../auth/auth.service';
import { buildAuthCookies, readCookie, readRefreshCookie } from '../../auth/auth-cookie.util';

interface AuthenticatedRequest {
  headers: { authorization?: string; cookie?: string; 'user-agent'?: string };
  ip?: string;
  secure?: boolean;
  socket?: { remoteAddress?: string };
  user?: RequestUser;
}

interface CookieResponse {
  setHeader: (name: string, value: string | string[]) => void;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const response = context.switchToHttp().getResponse<CookieResponse>();
    const authHeader = request.headers.authorization;
    const bearerToken = authHeader?.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length)
      : undefined;
    const cookieToken = readCookie(request.headers.cookie);
    const accessToken = bearerToken ?? cookieToken;
    const refreshToken = readRefreshCookie(request.headers.cookie);

    const authContext = {
      ipAddress: request.ip ?? request.socket?.remoteAddress ?? null,
      userAgent: request.headers['user-agent'] ?? null,
    };

    if (!accessToken) {
      if (!refreshToken) {
        throw new UnauthorizedException('Missing Supabase auth cookie');
      }

      const refreshed = await this.authService.refreshSession(refreshToken);
      response.setHeader(
        'Set-Cookie',
        buildAuthCookies(refreshed.accessToken, refreshed.refreshToken, request),
      );
      request.user = await this.authService.authenticateAccessToken(
        refreshed.accessToken,
        authContext,
      );
      return true;
    }

    try {
      request.user = await this.authService.authenticateAccessToken(accessToken, authContext);
    } catch (error) {
      if (!refreshToken || bearerToken) {
        throw error;
      }

      const refreshed = await this.authService.refreshSession(refreshToken);
      response.setHeader(
        'Set-Cookie',
        buildAuthCookies(refreshed.accessToken, refreshed.refreshToken, request),
      );
      request.user = await this.authService.authenticateAccessToken(
        refreshed.accessToken,
        authContext,
      );
    }

    return true;
  }
}
