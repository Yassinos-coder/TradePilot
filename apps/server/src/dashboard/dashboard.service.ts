import { Injectable } from '@nestjs/common';

import { DASHBOARD_RESULT_LIMIT } from '@tradepilot/config';
import { DashboardOverviewDTO, dashboardOverviewSchema } from '@tradepilot/shared';

import { AccountsService } from '../accounts/accounts.service';
import { ExecutionService } from '../execution/execution.service';
import { SignalsService } from '../signals/signals.service';

@Injectable()
export class DashboardService {
  constructor(
    private readonly accountsService: AccountsService,
    private readonly signalsService: SignalsService,
    private readonly executionService: ExecutionService,
  ) {}

  async getOverview(userId: string): Promise<DashboardOverviewDTO> {
    const [
      connectedAccounts,
      recentSignals,
      recentExecutionLogs,
      signalCount,
      recentTrades,
      analytics,
      lastTelegramMessage,
      latestAccountStatus,
    ] = await Promise.all([
      this.accountsService.listAccounts(userId),
      this.signalsService.listRecentSignals(userId, DASHBOARD_RESULT_LIMIT),
      this.executionService.listLogs(userId, DASHBOARD_RESULT_LIMIT),
      this.signalsService.countSignals(userId),
      this.executionService.listRecentTrades(userId, DASHBOARD_RESULT_LIMIT),
      this.executionService.getAnalytics(userId),
      this.signalsService.getLatestTelegramMessage(userId),
      this.accountsService.getLatestAccountStatus(userId),
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
      signalCount,
      accountStatus: latestAccountStatus ?? null,
      connectedAccounts,
      lastTelegramMessage,
      recentSignals,
      recentExecutionLogs,
      recentTrades,
      analytics,
    });
  }
}
