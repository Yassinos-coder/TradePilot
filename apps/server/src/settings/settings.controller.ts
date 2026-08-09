import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { SettingsDTO, settingsDtoSchema, sidebarOrderSchema } from '@tradepilot/shared';

import { RequestUser } from '../auth/types/request-user.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

import { SettingsService } from './settings.service';

const booleanToggleSchema = z.object({
  enabled: z.boolean(),
});

@UseGuards(JwtAuthGuard)
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  getSettings(@CurrentUser() user: RequestUser) {
    return this.settingsService.getSettings(user.userId);
  }

  @Put()
  updateSettings(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(settingsDtoSchema)) body: SettingsDTO,
  ) {
    return this.settingsService.updateSettings(user.userId, body);
  }

  @Put('auto-copy')
  updateAutoCopy(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(booleanToggleSchema))
    body: z.infer<typeof booleanToggleSchema>,
  ) {
    return this.settingsService.updateAutoCopy(user.userId, body.enabled);
  }

  @Put('api-trade-opening')
  updateApiTradeOpening(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(booleanToggleSchema))
    body: z.infer<typeof booleanToggleSchema>,
  ) {
    return this.settingsService.updateAllowApiTradeOpening(user.userId, body.enabled);
  }

  @Put('sidebar-order')
  updateSidebarOrder(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(z.object({ order: sidebarOrderSchema })))
    body: { order: string[] },
  ) {
    return this.settingsService.updateSidebarOrder(user.userId, body.order);
  }
}
