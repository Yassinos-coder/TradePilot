import { Injectable } from '@nestjs/common';

import { DASHBOARD_RESULT_LIMIT } from '@tradepilot/config';
import { DashboardOverviewDTO, dashboardOverviewSchema } from '@tradepilot/shared';

import { EaGatewayService } from '../ea/ea-gateway.service';
import { ExecutionService } from '../execution/execution.service';
import { SignalsService } from '../signals/signals.service';

@Injectable()
export class DashboardService {
  constructor(
    private readonly gateway: EaGatewayService,
    private readonly signalsService: SignalsService,
    private readonly executionService: ExecutionService,
  ) {}

  async getOverview(userId: string): Promise<DashboardOverviewDTO> {
    const [recentSignals, recentExecutionLogs, connectionState, signalCount] = await Promise.all([
      this.signalsService.listRecentSignals(userId, DASHBOARD_RESULT_LIMIT),
      this.executionService.listLogs(userId, DASHBOARD_RESULT_LIMIT),
      this.gateway.getConnectionState(userId),
      this.signalsService.countSignals(userId),
    ]);

    return dashboardOverviewSchema.parse({
      eaOnline: connectionState.online,
      eaLatencyMs: connectionState.latencyMs,
      eaLastSeenAt: connectionState.lastSeenAt,
      signalCount,
      recentSignals,
      recentExecutionLogs,
    });
  }
}
