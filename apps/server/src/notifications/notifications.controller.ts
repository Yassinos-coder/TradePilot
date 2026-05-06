import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';

import {
  NotificationPreferencesDTO,
  notificationPreferencesSchema,
} from '@tradepilot/shared';

import { RequestUser } from '../auth/types/request-user.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

import { NotificationsService } from './notifications.service';

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('preferences')
  getPreferences(@CurrentUser() user: RequestUser) {
    return this.notificationsService.getPreferences(user.userId);
  }

  @Put('preferences')
  updatePreferences(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(notificationPreferencesSchema))
    body: NotificationPreferencesDTO,
  ) {
    return this.notificationsService.updatePreferences(user.userId, body);
  }
}
