import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { RequestUser } from '../auth/types/request-user.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

import { ExecutionService } from './execution.service';
import {
  TradeHistoryImportService,
  UploadedTradeHistoryFile,
} from './trade-history-import.service';

@UseGuards(JwtAuthGuard)
@Controller('execution')
export class ExecutionController {
  constructor(
    private readonly executionService: ExecutionService,
    private readonly tradeHistoryImportService: TradeHistoryImportService,
  ) {}

  @Post(':signalId/dispatch-manual')
  dispatchManual(
    @CurrentUser() user: RequestUser,
    @Param('signalId') signalId: string,
    @Body() body: { accountId: string },
  ) {
    return this.executionService.dispatchManual(user.userId, signalId, body.accountId);
  }

  @Get('history-files')
  listHistoryFiles(@CurrentUser() user: RequestUser) {
    return this.tradeHistoryImportService.listFiles(user.userId);
  }

  @Post('history-files')
  @UseInterceptors(FileInterceptor('file'))
  uploadHistoryFile(
    @CurrentUser() user: RequestUser,
    @UploadedFile() file: UploadedTradeHistoryFile,
  ) {
    return this.tradeHistoryImportService.uploadFile(user.userId, file);
  }

  @Delete('history-files/:fileId')
  deleteHistoryFile(
    @CurrentUser() user: RequestUser,
    @Param('fileId') fileId: string,
  ) {
    return this.tradeHistoryImportService.deleteFile(user.userId, fileId);
  }

  @Get('analytics')
  getAnalytics(
    @CurrentUser() user: RequestUser,
    @Query('accountId') accountId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.executionService.getAnalytics(user.userId, accountId, startDate, endDate);
  }

  @Get('daily-summary')
  getDailySummary(
    @CurrentUser() user: RequestUser,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('accountId') accountId?: string,
  ) {
    if (!startDate || !endDate) {
      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      startDate = startDate ?? firstDay.toISOString().slice(0, 10);
      endDate = endDate ?? now.toISOString().slice(0, 10);
    }
    return this.executionService.getDailyProfitSummary(user.userId, startDate, endDate, accountId);
  }

  @Get('ai-analysis')
  getAiAnalysis(
    @CurrentUser() user: RequestUser,
    @Query('accountId') accountId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.executionService.getAiAnalysis(user.userId, accountId, startDate, endDate);
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
