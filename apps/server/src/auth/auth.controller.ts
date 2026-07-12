import { Body, Controller, Delete, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { UserDTO } from '@tradepilot/shared';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RequestUser } from './types/request-user.type';
import { AuthService } from './auth.service';
import { buildAuthCookies, buildClearAuthCookies } from './auth-cookie.util';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('session')
  async setSessionCookie(
    @Body('accessToken') accessToken: string,
    @Body('refreshToken') refreshToken: string | undefined,
    @Req() request: any,
    @Res({ passthrough: true }) response: any,
  ) {
    await this.authService.authenticateAccessToken(accessToken, {
      ipAddress: request.ip ?? request.socket?.remoteAddress ?? null,
      userAgent: request.headers['user-agent'] ?? null,
    });
    response.setHeader('Set-Cookie', buildAuthCookies(accessToken, refreshToken, request));
    return { success: true };
  }

  @Delete('session')
  clearSessionCookie(
    @Req() request: any,
    @Res({ passthrough: true }) response: any,
  ) {
    response.setHeader('Set-Cookie', buildClearAuthCookies(request));
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getCurrentUser(@CurrentUser() user: RequestUser): Promise<UserDTO> {
    return this.authService.getCurrentUserFromRequest(user);
  }
}
