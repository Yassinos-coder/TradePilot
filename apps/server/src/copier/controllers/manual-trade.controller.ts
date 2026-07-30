import { BadRequestException, Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';

import {
  TradeApiCloseInput,
  TradeApiModifyInput,
  TradeApiOpenInput,
  tradeApiCloseSchema,
  tradeApiModifySchema,
  tradeApiOpenSchema,
} from '@tradepilot/shared';

import { RequestUser } from '../../auth/types/request-user.type';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { TradeCommandService } from '../services/trade-command.service';

/**
 * Manual trading from the dashboard, authenticated by the user's own session.
 *
 * Deliberately separate from the API-key route in TradeApiController: the
 * `allowApiTradeOpening` setting governs third-party keys, and must not stop the
 * account owner from placing a trade in their own UI.
 */
@UseGuards(JwtAuthGuard)
@Controller('trades')
export class ManualTradeController {
  constructor(private readonly tradeCommandService: TradeCommandService) {}

  @Get('positions')
  listPositions(@CurrentUser() user: RequestUser, @Query('accountId') accountId?: string) {
    if (!accountId) {
      throw new BadRequestException('accountId query parameter is required');
    }

    return this.tradeCommandService.listOpenPositions(user.userId, accountId);
  }

  @Post('open')
  openPosition(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(tradeApiOpenSchema)) body: TradeApiOpenInput,
  ) {
    return this.tradeCommandService.openPosition(user.userId, body);
  }

  @Post('close')
  closePosition(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(tradeApiCloseSchema)) body: TradeApiCloseInput,
  ) {
    return this.tradeCommandService.closePosition(user.userId, body);
  }

  @Post('modify')
  modifyPosition(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(tradeApiModifySchema)) body: TradeApiModifyInput,
  ) {
    return this.tradeCommandService.modifyPosition(user.userId, body);
  }
}
