import { Controller, Get, Post, UseGuards } from '@nestjs/common';

import { RequestUser } from '../auth/types/request-user.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

import { UsersService } from './users.service';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  getProfile(@CurrentUser() user: RequestUser) {
    return this.usersService.getProfile(user.userId);
  }

  @Post('api-key/regenerate')
  rotateApiKey(@CurrentUser() user: RequestUser) {
    return this.usersService.rotateApiKey(user.userId);
  }
}
