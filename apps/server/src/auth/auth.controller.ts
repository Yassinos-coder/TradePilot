import { Controller, Get, UseGuards } from '@nestjs/common';
import { UserDTO } from '@tradepilot/shared';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RequestUser } from './types/request-user.type';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getCurrentUser(@CurrentUser() user: RequestUser): Promise<UserDTO> {
    return this.authService.getCurrentUserFromRequest(user);
  }
}
