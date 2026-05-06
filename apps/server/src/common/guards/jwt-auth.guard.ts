import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { RequestUser } from '../../auth/types/request-user.type';
import { AuthService } from '../../auth/auth.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: { authorization?: string; 'user-agent'?: string };
      ip?: string;
      socket?: { remoteAddress?: string };
      user?: RequestUser;
    }>();
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing Supabase bearer token');
    }

    const accessToken = authHeader.slice('Bearer '.length);
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
