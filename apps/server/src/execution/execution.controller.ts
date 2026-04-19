import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';

import { RequestUser } from '../auth/types/request-user.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

import { ExecutionService } from './execution.service';

@UseGuards(JwtAuthGuard)
@Controller('execution')
export class ExecutionController {
  constructor(private readonly executionService: ExecutionService) {}

  @Post(':signalId/dispatch-manual')
  dispatchManual(
    @CurrentUser() user: RequestUser,
    @Param('signalId') signalId: string,
    @Body() body: { accountId: string },
  ) {
    return this.executionService.dispatchManual(user.userId, signalId, body.accountId);
  }

  @Get('analytics')
  getAnalytics(
    @CurrentUser() user: RequestUser,
    @Query('accountId') accountId?: string,
  ) {
    return this.executionService.getAnalytics(user.userId, accountId);
  }

  @Get('trades')
  listRecentTrades(
    @CurrentUser() user: RequestUser,
    @Query('limit') limit?: string,
    @Query('accountId') accountId?: string,
  ) {
    return this.executionService.listRecentTrades(
      user.userId,
      Number(limit ?? 10),
      accountId,
    );
  }

  @Get('logs')
  listLogs(
    @CurrentUser() user: RequestUser,
    @Query('limit') limit?: string,
    @Query('accountId') accountId?: string,
  ) {
    return this.executionService.listLogs(user.userId, Number(limit ?? 10), accountId);
  }
}
