import { Body, Controller, Get, NotFoundException, Post, Put, UseGuards } from '@nestjs/common';

import {
  ChangePasswordInput,
  RequestEmailChangeInput,
  UpdateProfileInput,
  VerifyEmailChangeInput,
  changePasswordSchema,
  requestEmailChangeSchema,
  updateProfileSchema,
  verifyEmailChangeSchema,
} from '@tradepilot/shared';

import { RequestUser } from '../auth/types/request-user.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { NotificationsService } from '../notifications/notifications.service';

import { UsersService } from './users.service';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Get('me')
  getProfile(@CurrentUser() user: RequestUser) {
    return this.usersService.getProfile(user.userId);
  }

  @Put('me')
  updateProfile(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(updateProfileSchema)) body: UpdateProfileInput,
  ) {
    return this.usersService.updateProfile(user.userId, body);
  }

  @Post('email-change/request')
  requestEmailChange(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(requestEmailChangeSchema)) body: RequestEmailChangeInput,
  ) {
    return this.usersService
      .requestEmailChange(user.userId, body.newEmail)
      .then(async (result) => {
        await this.notificationsService.sendEmailChangeVerification(
          user.userId,
          body.newEmail,
          result.token,
        );
        return result.user;
      });
  }

  @Post('email-change/verify')
  verifyEmailChange(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(verifyEmailChangeSchema)) body: VerifyEmailChangeInput,
  ) {
    return this.usersService.verifyEmailChange(user.userId, body.token);
  }

  @Post('password/change')
  async changePassword(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(changePasswordSchema)) body: ChangePasswordInput,
  ) {
    const profile = await this.usersService.findById(user.userId);

    if (!profile) {
      throw new NotFoundException('User profile was not found');
    }

    await this.usersService.changePassword(
      profile,
      body.currentPassword,
      body.newPassword,
    );

    return { success: true };
  }

  @Get('sessions')
  listSessions(@CurrentUser() user: RequestUser) {
    return this.usersService.listSessions(user.userId);
  }

  @Post('sessions/logout-all')
  async logoutAll(@CurrentUser() user: RequestUser) {
    await this.usersService.logoutAllDevices(user.userId, user.accessToken);
    return { success: true };
  }

  @Post('api-key/regenerate')
  rotateApiKey(@CurrentUser() user: RequestUser) {
    return this.usersService.rotateApiKey(user.userId);
  }
}
