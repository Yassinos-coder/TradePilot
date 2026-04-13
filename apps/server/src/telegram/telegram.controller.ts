import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';

import {
  TelegramConnectCodeInput,
  TelegramConnectPasswordInput,
  TelegramConnectStartInput,
  telegramConnectCodeSchema,
  telegramConnectPasswordSchema,
  telegramConnectStartSchema,
} from '@tradepilot/shared';

import { RequestUser } from '../auth/types/request-user.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

import { TelegramService } from './telegram.service';

@UseGuards(JwtAuthGuard)
@Controller('telegram')
export class TelegramController {
  constructor(private readonly telegramService: TelegramService) {}

  @Get('connection')
  getConnection(@CurrentUser() user: RequestUser) {
    return this.telegramService.getConnection(user.userId);
  }

  @Post('connect/start')
  startConnection(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(telegramConnectStartSchema))
    body: TelegramConnectStartInput,
  ) {
    return this.telegramService.startConnection(user.userId, body);
  }

  @Post('connect/verify-code')
  verifyCode(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(telegramConnectCodeSchema))
    body: TelegramConnectCodeInput,
  ) {
    return this.telegramService.verifyCode(user.userId, body.phoneCode);
  }

  @Post('connect/verify-password')
  verifyPassword(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(telegramConnectPasswordSchema))
    body: TelegramConnectPasswordInput,
  ) {
    return this.telegramService.verifyPassword(user.userId, body.password);
  }

  @Post('connect/disconnect')
  disconnect(@CurrentUser() user: RequestUser) {
    return this.telegramService.disconnectConnection(user.userId);
  }

  @Post('channels/sync')
  syncChannels(@CurrentUser() user: RequestUser) {
    return this.telegramService.syncChannels(user.userId);
  }

  @Get('channels')
  listChannels(@CurrentUser() user: RequestUser) {
    return this.telegramService.listChannels(user.userId);
  }

  @Post('channels/:channelId/toggle')
  toggleChannel(@CurrentUser() user: RequestUser, @Param('channelId') channelId: string) {
    return this.telegramService.toggleChannel(user.userId, channelId);
  }
}
