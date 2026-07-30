import {
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { RequestUser } from '../../auth/types/request-user.type';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AnalyticsService } from '../services/analytics.service';
import {
  TradeHistoryImportService,
  UploadedTradeHistoryFile,
} from '../services/trade-history-import.service';

@UseGuards(JwtAuthGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly tradeHistoryImportService: TradeHistoryImportService,
  ) {}

  @Get('summary')
  getAnalytics(
    @CurrentUser() user: RequestUser,
    @Query('accountId') accountId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.analyticsService.getAnalytics(user.userId, accountId, startDate, endDate);
  }

  @Get('daily-summary')
  getDailySummary(
    @CurrentUser() user: RequestUser,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('accountId') accountId?: string,
  ) {
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const resolvedStart = startDate ?? firstDayOfMonth.toISOString().slice(0, 10);
    const resolvedEnd = endDate ?? now.toISOString().slice(0, 10);

    return this.analyticsService.getDailyProfitSummary(
      user.userId,
      resolvedStart,
      resolvedEnd,
      accountId,
    );
  }

  @Get('ai-analysis')
  getAiAnalysis(
    @CurrentUser() user: RequestUser,
    @Query('accountId') accountId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.analyticsService.getAiAnalysis(user.userId, accountId, startDate, endDate);
  }

  @Get('trades')
  listRecentTrades(
    @CurrentUser() user: RequestUser,
    @Query('limit') limit?: string,
    @Query('accountId') accountId?: string,
  ) {
    const parsed = Number(limit);
    return this.analyticsService.listRecentTrades(
      user.userId,
      Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 500) : 10,
      accountId,
    );
  }

  @Get('logs')
  listLogs(
    @CurrentUser() user: RequestUser,
    @Query('limit') limit?: string,
    @Query('accountId') accountId?: string,
  ) {
    const parsed = Number(limit);
    return this.analyticsService.listLogs(
      user.userId,
      Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 500) : 10,
      accountId,
    );
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
    @Param('fileId', ParseUUIDPipe) fileId: string,
  ) {
    return this.tradeHistoryImportService.deleteFile(user.userId, fileId);
  }
}
