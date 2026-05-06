import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { SettingsDTO, settingsDtoSchema } from '@tradepilot/shared';

import { RequestUser } from '../auth/types/request-user.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

import { SettingsService } from './settings.service';

const autoCopyToggleSchema = z.object({
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
    @Body(new ZodValidationPipe(autoCopyToggleSchema))
    body: z.infer<typeof autoCopyToggleSchema>,
  ) {
    return this.settingsService.updateAutoCopy(user.userId, body.enabled);
  }
}
