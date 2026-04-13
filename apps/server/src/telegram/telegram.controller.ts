import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';

import {
  SimulateTelegramSignalInput,
  simulateTelegramSignalSchema,
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

  @Get('channels')
  listChannels(@CurrentUser() user: RequestUser) {
    return this.telegramService.listChannels(user.userId);
  }

  @Post('channels/:channelId/toggle')
  toggleChannel(@CurrentUser() user: RequestUser, @Param('channelId') channelId: string) {
    return this.telegramService.toggleChannel(user.userId, channelId);
  }

  @Post('simulate')
  simulateSignal(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(simulateTelegramSignalSchema))
    body: SimulateTelegramSignalInput,
  ) {
    return this.telegramService.simulateIncomingSignal(user.userId, body);
  }
}
