import { Injectable, InternalServerErrorException } from '@nestjs/common';

import { DatabaseService } from '../../database/database.service';
import {
  AccountStatusSnapshotRecord,
  CopierLinkRecord,
  TradeExecutionRecord,
} from '../../database/database.types';
import { CopierGuardInput, CopierGuardResult } from '../interfaces/copier.interfaces';

export interface SlaveRiskSnapshot {
  status: AccountStatusSnapshotRecord | null;
  openPositionCount: number;
  netProfitToday: number;
}

/**
 * Per-link risk gate. Everything here is scoped to one slave account and reads
 * its limits from the link, not from global settings — two slaves off the same
 * master can carry completely different risk.
 */
@Injectable()
export class CopierGuardService {
  constructor(private readonly databaseService: DatabaseService) {}

  /** One batched read per slave account, reused across all events in a fan-out. */
  async loadSlaveSnapshot(
    userId: string,
    slaveExternalAccountId: string,
  ): Promise<SlaveRiskSnapshot> {
    const client = this.databaseService.getClient();
    const dayStartUtc = new Date();
    dayStartUtc.setUTCHours(0, 0, 0, 0);

    const [statusResult, openTradesResult, closedTodayResult] = await Promise.all([
      client
        .from('ea_account_status_snapshots')
        .select('*')
        .eq('user_id', userId)
        .eq('account_id', slaveExternalAccountId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      client
        .from('trade_executions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('account_id', slaveExternalAccountId)
        .eq('status', 'OPEN'),
      client
        .from('trade_executions')
        .select('profit')
        .eq('user_id', userId)
        .eq('account_id', slaveExternalAccountId)
        .eq('status', 'CLOSED')
        .gte('closed_at', dayStartUtc.toISOString())
        .limit(2_000),
    ]);

    if (statusResult.error) {
      throw new InternalServerErrorException(statusResult.error.message);
    }

    if (openTradesResult.error) {
      throw new InternalServerErrorException(openTradesResult.error.message);
    }

    if (closedTodayResult.error) {
      throw new InternalServerErrorException(closedTodayResult.error.message);
    }

    const closedToday = (closedTodayResult.data ?? []) as Array<
      Pick<TradeExecutionRecord, 'profit'>
    >;

    return {
      status: (statusResult.data as AccountStatusSnapshotRecord | null) ?? null,
      openPositionCount: openTradesResult.count ?? 0,
      netProfitToday: closedToday.reduce(
        (sum, trade) => sum + (typeof trade.profit === 'number' ? trade.profit : 0),
        0,
      ),
    };
  }

  evaluate(input: CopierGuardInput): CopierGuardResult {
    const { link, event } = input;

    // Position and drawdown caps only bind when opening new exposure. A close
    // must always be allowed through, or a slave could be stranded holding a
    // position the master has already exited.
    if (event.action !== 'OPEN') {
      return { allowed: true };
    }

    const equityCheck = this.checkEquityFloor(link, input.slaveStatus);

    if (!equityCheck.allowed) {
      return equityCheck;
    }

    if (input.openPositionCount >= Number(link.max_open_positions)) {
      return {
        allowed: false,
        reason: `Max open positions reached on this slave (${input.openPositionCount}/${link.max_open_positions})`,
      };
    }

    const dailyLossCheck = this.checkDailyLoss(link, input);

    if (!dailyLossCheck.allowed) {
      return dailyLossCheck;
    }

    return this.checkDrawdown(link, input.slaveStatus);
  }

  private checkEquityFloor(
    link: CopierLinkRecord,
    status: AccountStatusSnapshotRecord | null,
  ): CopierGuardResult {
    const floor = link.equity_floor === null ? null : Number(link.equity_floor);

    if (floor === null || !status) {
      return { allowed: true };
    }

    if (status.equity < floor) {
      return {
        allowed: false,
        reason: `Slave equity ${status.equity.toFixed(2)} is below the floor of ${floor.toFixed(2)}`,
      };
    }

    return { allowed: true };
  }

  private checkDailyLoss(link: CopierLinkRecord, input: CopierGuardInput): CopierGuardResult {
    const { slaveStatus, netProfitToday } = input;

    if (netProfitToday >= 0 || !slaveStatus || slaveStatus.balance <= 0) {
      return { allowed: true };
    }

    const lossPercent = (Math.abs(netProfitToday) / slaveStatus.balance) * 100;
    const limit = Number(link.max_daily_loss_percent);

    if (lossPercent >= limit) {
      return {
        allowed: false,
        reason: `Slave daily loss limit reached (${lossPercent.toFixed(2)}% / ${limit}%)`,
      };
    }

    return { allowed: true };
  }

  private checkDrawdown(
    link: CopierLinkRecord,
    status: AccountStatusSnapshotRecord | null,
  ): CopierGuardResult {
    if (!status) {
      return { allowed: true };
    }

    const limit = Number(link.max_drawdown_percent);

    if (status.drawdown_percent >= limit) {
      return {
        allowed: false,
        reason: `Slave drawdown limit reached (${status.drawdown_percent.toFixed(2)}% / ${limit}%)`,
      };
    }

    return { allowed: true };
  }
}
