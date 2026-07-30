import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import {
  TradeApiCloseInput,
  TradeApiModifyInput,
  TradeApiOpenInput,
  tradeApiCloseSchema,
  tradeApiModifySchema,
  tradeApiOpenSchema,
} from '@tradepilot/shared';

import { ApiKeyContext } from '../../common/decorators/api-key-context.decorator';
import { ApiKeyGuard, ApiKeyRequestContext } from '../../common/guards/api-key.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { SettingsService } from '../../settings/settings.service';
import { TradeCommandService } from '../services/trade-command.service';

/**
 * HTTP trade API, authenticated with a REST API key.
 *
 * Opening a position additionally requires the account owner to have switched on
 * "Allow trade opening through API" in settings. Closing and modifying are
 * deliberately not gated by it: withdrawing the permission must never leave a
 * caller unable to shut down exposure it already has.
 */
@UseGuards(ApiKeyGuard)
@Controller('v1/trades')
export class TradeApiController {
  constructor(
    private readonly tradeCommandService: TradeCommandService,
    private readonly settingsService: SettingsService,
  ) {}

  @Get('positions')
  listPositions(
    @ApiKeyContext() context: ApiKeyRequestContext,
    @Query('accountId') accountId?: string,
  ) {
    if (!accountId) {
      throw new BadRequestException('accountId query parameter is required');
    }

    return this.tradeCommandService.listOpenPositions(context.userId, accountId);
  }

  @Post('open')
  async openPosition(
    @ApiKeyContext() context: ApiKeyRequestContext,
    @Body(new ZodValidationPipe(tradeApiOpenSchema)) body: TradeApiOpenInput,
  ) {
    const settings = await this.settingsService.getSettings(context.userId);

    if (!settings.allowApiTradeOpening) {
      throw new ForbiddenException(
        'Trade opening through the API is disabled for this account. Enable it in Settings → API & Keys.',
      );
    }

    return this.tradeCommandService.openPosition(context.userId, body);
  }

  @Post('close')
  closePosition(
    @ApiKeyContext() context: ApiKeyRequestContext,
    @Body(new ZodValidationPipe(tradeApiCloseSchema)) body: TradeApiCloseInput,
  ) {
    return this.tradeCommandService.closePosition(context.userId, body);
  }

  @Post('modify')
  modifyPosition(
    @ApiKeyContext() context: ApiKeyRequestContext,
    @Body(new ZodValidationPipe(tradeApiModifySchema)) body: TradeApiModifyInput,
  ) {
    return this.tradeCommandService.modifyPosition(context.userId, body);
  }
}
