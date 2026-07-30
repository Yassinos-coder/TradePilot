import { Injectable } from '@nestjs/common';

import { DASHBOARD_RESULT_LIMIT } from '@tradepilot/config';
import { DashboardOverviewDTO, dashboardOverviewSchema } from '@tradepilot/shared';

import { AccountsService } from '../accounts/accounts.service';
import { AnalyticsService } from '../analytics/services/analytics.service';
import { CopierLinksService } from '../copier/services/copier-links.service';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class DashboardService {
  constructor(
    private readonly accountsService: AccountsService,
    private readonly analyticsService: AnalyticsService,
    private readonly copierLinksService: CopierLinksService,
    private readonly settingsService: SettingsService,
  ) {}

  async getOverview(userId: string): Promise<DashboardOverviewDTO> {
    await this.analyticsService.syncLiveExecutionData(userId);

    const [
      connectedAccounts,
      recentExecutionLogs,
      recentTrades,
      analytics,
      latestAccountStatus,
      settings,
      copier,
      recentCopyEvents,
    ] = await Promise.all([
      this.accountsService.listAccounts(userId),
      this.analyticsService.listLogs(userId, DASHBOARD_RESULT_LIMIT),
      this.analyticsService.listRecentTrades(userId, DASHBOARD_RESULT_LIMIT),
      this.analyticsService.getAnalytics(userId),
      this.accountsService.getLatestAccountStatus(userId),
      this.settingsService.getSettings(userId),
      this.copierLinksService.getOverview(userId),
      this.copierLinksService.listCopyEvents(userId, DASHBOARD_RESULT_LIMIT),
    ]);

    const onlineAccounts = connectedAccounts.filter((account) => account.online);
    const latestOnlineAccount = [...onlineAccounts].sort((left, right) => {
      const leftTime = left.lastSeenAt ? new Date(left.lastSeenAt).getTime() : 0;
      const rightTime = right.lastSeenAt ? new Date(right.lastSeenAt).getTime() : 0;
      return rightTime - leftTime;
    })[0];

    return dashboardOverviewSchema.parse({
      eaOnline: onlineAccounts.length > 0,
      eaLatencyMs: latestOnlineAccount?.latencyMs ?? null,
      eaLastSeenAt: latestOnlineAccount?.lastSeenAt ?? null,
      accountStatus: latestAccountStatus ?? null,
      connectedAccounts,
      copier,
      recentCopyEvents,
      recentExecutionLogs,
      recentTrades,
      analytics,
      tradingEngine: {
        autoCopyEnabled: settings.autoCopyEnabled,
        executionPaused: settings.executionPaused,
        executionPauseReason: settings.executionPauseReason,
        allowApiTradeOpening: settings.allowApiTradeOpening,
        riskStatus: settings.executionPaused
          ? 'PAUSED'
          : settings.autoCopyEnabled
            ? 'OK'
            : 'LIMIT_HIT',
        connectedAccounts: onlineAccounts.length,
        lastTradeAt: recentTrades[0]?.updatedAt ?? null,
      },
    });
  }
}
