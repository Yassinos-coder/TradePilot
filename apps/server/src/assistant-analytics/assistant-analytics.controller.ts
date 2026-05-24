import {
  Controller,
  Get,
  Headers,
  Query,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ExecutionService } from '../execution/execution.service';

@Controller('assistant/analytics')
export class AssistantAnalyticsController {
  constructor(
    private readonly executionService: ExecutionService,
    private readonly configService: ConfigService,
  ) {}

  @Get('tradepilot')
  async getReadOnlyAnalytics(
    @Headers('x-tradepilot-analytics-token') token?: string,
    @Query('accountId') accountId?: string,
  ) {
    const expectedToken = this.configService.get<string>('TRADEPILOT_ANALYTICS_READ_TOKEN');
    const userId = this.configService.get<string>('TRADEPILOT_ANALYTICS_USER_ID');

    if (!expectedToken || !userId) {
      throw new ServiceUnavailableException('TradePilot analytics read API is not configured');
    }

    if (!token || token !== expectedToken) {
      throw new UnauthorizedException('Invalid TradePilot analytics token');
    }

    const normalizedAccountId = accountId?.trim() || undefined;
    const [analytics, recentTrades, latestAccountStatus] = await Promise.all([
      this.executionService.getAnalytics(userId, normalizedAccountId),
      this.executionService.listRecentTrades(userId, 25, normalizedAccountId),
      this.executionService.getLatestAccountStatus(userId, normalizedAccountId),
    ]);

    return {
      schemaVersion: 'tradepilot.analytics.read.v1',
      generatedAt: new Date().toISOString(),
      readOnly: true,
      accountId: normalizedAccountId ?? null,
      analytics,
      recentTrades,
      latestAccountStatus,
    };
  }
}
