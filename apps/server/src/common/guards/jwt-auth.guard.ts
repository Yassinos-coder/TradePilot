import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { RequestUser } from '../../auth/types/request-user.type';
import { AuthService } from '../../auth/auth.service';
import { readCookie } from '../../auth/auth-cookie.util';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: { authorization?: string; cookie?: string; 'user-agent'?: string };
      ip?: string;
      socket?: { remoteAddress?: string };
      user?: RequestUser;
    }>();
    const authHeader = request.headers.authorization;
    const accessToken = authHeader?.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length)
      : readCookie(request.headers.cookie);

    if (!accessToken) {
      throw new UnauthorizedException('Missing Supabase auth cookie');
    }
    request.user = await this.authService.authenticateAccessToken(
      accessToken,
      {
        ipAddress: request.ip ?? request.socket?.remoteAddress ?? null,
        userAgent: request.headers['user-agent'] ?? null,
      },
    );

    return true;
  }
}
