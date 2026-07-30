import {
  Controller,
  Get,
  Headers,
  Query,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AnalyticsService } from '../analytics/services/analytics.service';

@Controller('assistant/analytics')
export class AssistantAnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
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

    const normalizedAccountId = this.normalizeAccountSelector(accountId);
    const [analytics, recentTrades, latestAccountStatus] = await Promise.all([
      this.analyticsService.getAnalytics(userId, normalizedAccountId),
      this.analyticsService.listRecentTrades(userId, 25, normalizedAccountId),
      this.analyticsService.getLatestAccountStatus(userId, normalizedAccountId),
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

  private normalizeAccountSelector(accountId?: string): string | undefined {
    const trimmed = accountId?.trim();

    if (!trimmed) {
      return undefined;
    }

    const normalized = trimmed.toLowerCase();
    if (normalized === 'all' || normalized === 'all accounts') {
      return undefined;
    }

    const labelMatch = trimmed.match(/\(([^()]+)\)\s*$/);
    if (labelMatch?.[1]?.trim()) {
      return labelMatch[1].trim();
    }

    return trimmed;
  }
}
