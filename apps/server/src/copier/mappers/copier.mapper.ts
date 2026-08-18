import {
  CopierLinkDTO,
  CopierRiskParams,
  CopyEventDTO,
  CopyOrderDTO,
  copierLinkSchema,
  copyEventSchema,
  copyOrderSchema,
} from '@tradepilot/shared';

import { accountLabel } from '../../common/mappers/account-label';
import {
  AccountRecord,
  CopierLinkRecord,
  CopyEventRecord,
  CopyOrderRecord,
} from '../../database/database.types';

export class CopierMapper {
  static toLinkDto(
    record: CopierLinkRecord,
    context: {
      slaveAccount: AccountRecord | null;
      slaveOnline: boolean;
      copiesToday: number;
      lastCopyAt: string | null;
    },
  ): CopierLinkDTO {
    return copierLinkSchema.parse({
      id: record.id,
      masterAccountId: record.master_account_id,
      slaveAccountId: record.slave_account_id,
      slaveAccountName: accountLabel(context.slaveAccount),
      slaveAccountOnline: context.slaveOnline,
      enabled: record.enabled,
      copiesToday: context.copiesToday,
      lastCopyAt: context.lastCopyAt,
      symbolMatchStatus: record.symbol_match_status,
      symbolMatchReport: record.symbol_match_report ?? [],
      symbolMatchCheckedAt: record.symbol_match_checked_at,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
      ...CopierMapper.toRiskParams(record),
    });
  }

  static toRiskParams(record: CopierLinkRecord): CopierRiskParams {
    return {
      sizingMode: record.sizing_mode,
      fixedLot: CopierMapper.toNullableNumber(record.fixed_lot),
      lotMultiplier: Number(record.lot_multiplier),
      riskPercent: CopierMapper.toNullableNumber(record.risk_percent),
      minLot: Number(record.min_lot),
      maxLot: Number(record.max_lot),
      maxOpenPositions: Number(record.max_open_positions),
      maxDailyLossPercent: Number(record.max_daily_loss_percent),
      maxDrawdownPercent: Number(record.max_drawdown_percent),
      equityFloor: CopierMapper.toNullableNumber(record.equity_floor),
      maxSpreadPoints: CopierMapper.toNullableNumber(record.max_spread_points),
      maxSlippagePoints: Number(record.max_slippage_points),
      maxCopyDelayMs: Number(record.max_copy_delay_ms),
      copyStopLoss: record.copy_stop_loss,
      copyTakeProfit: record.copy_take_profit,
      copyModifications: record.copy_modifications,
      copyPartialCloses: record.copy_partial_closes,
      copyCloses: record.copy_closes,
      reverseCopy: record.reverse_copy,
      symbolFilterMode: record.symbol_filter_mode,
      symbolFilter: record.symbol_filter ?? [],
      symbolPrefix: record.symbol_prefix,
      symbolSuffix: record.symbol_suffix,
    };
  }

  /** camelCase risk params → snake_case columns, skipping absent keys. */
  static toRiskColumns(params: Partial<CopierRiskParams>): Record<string, unknown> {
    const columnByField: Record<keyof CopierRiskParams, string> = {
      sizingMode: 'sizing_mode',
      fixedLot: 'fixed_lot',
      lotMultiplier: 'lot_multiplier',
      riskPercent: 'risk_percent',
      minLot: 'min_lot',
      maxLot: 'max_lot',
      maxOpenPositions: 'max_open_positions',
      maxDailyLossPercent: 'max_daily_loss_percent',
      maxDrawdownPercent: 'max_drawdown_percent',
      equityFloor: 'equity_floor',
      maxSpreadPoints: 'max_spread_points',
      maxSlippagePoints: 'max_slippage_points',
      maxCopyDelayMs: 'max_copy_delay_ms',
      copyStopLoss: 'copy_stop_loss',
      copyTakeProfit: 'copy_take_profit',
      copyModifications: 'copy_modifications',
      copyPartialCloses: 'copy_partial_closes',
      copyCloses: 'copy_closes',
      reverseCopy: 'reverse_copy',
      symbolFilterMode: 'symbol_filter_mode',
      symbolFilter: 'symbol_filter',
      symbolPrefix: 'symbol_prefix',
      symbolSuffix: 'symbol_suffix',
    };

    const columns: Record<string, unknown> = {};

    for (const [field, column] of Object.entries(columnByField)) {
      const value = params[field as keyof CopierRiskParams];

      if (value !== undefined) {
        columns[column] = value;
      }
    }

    return columns;
  }

  static toCopyOrderDto(
    record: CopyOrderRecord,
    slaveAccountName: string | null,
  ): CopyOrderDTO {
    return copyOrderSchema.parse({
      id: record.id,
      copierLinkId: record.copier_link_id,
      slaveAccountId: record.slave_account_id,
      slaveAccountName,
      masterTicket: record.master_ticket,
      slaveTicket: record.slave_ticket,
      requestedSymbol: record.requested_symbol,
      resolvedSymbol: record.resolved_symbol,
      side: record.side,
      requestedVolume: CopierMapper.toNullableNumber(record.requested_volume),
      filledVolume: CopierMapper.toNullableNumber(record.filled_volume),
      status: record.status,
      skipReason: record.skip_reason,
      createdAt: record.created_at,
    });
  }

  static toCopyEventDto(
    record: CopyEventRecord,
    context: { masterAccountName: string | null; orders: CopyOrderDTO[] },
  ): CopyEventDTO {
    return copyEventSchema.parse({
      id: record.id,
      masterAccountId: record.master_account_id,
      masterAccountName: context.masterAccountName,
      masterTicket: record.master_ticket,
      action: record.action,
      symbol: record.symbol,
      side: record.side,
      volume: CopierMapper.toNullableNumber(record.volume),
      entryPrice: CopierMapper.toNullableNumber(record.entry_price),
      stopLoss: CopierMapper.toNullableNumber(record.stop_loss),
      takeProfit: CopierMapper.toNullableNumber(record.take_profit),
      closePercent: CopierMapper.toNullableNumber(record.close_percent),
      masterEventAt: record.master_event_at,
      createdAt: record.created_at,
      orders: context.orders,
    });
  }

  /** Postgres numerics arrive as strings through the REST layer. */
  private static toNullableNumber(value: number | string | null): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
}
