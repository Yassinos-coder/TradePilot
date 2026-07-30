import { TradeExecutionDTO, tradeExecutionDtoSchema } from '@tradepilot/shared';

import { TradeExecutionRecord } from '../../database/database.types';

export class TradeExecutionMapper {
  static toDto(record: TradeExecutionRecord): TradeExecutionDTO {
    return tradeExecutionDtoSchema.parse({
      id: record.id,
      copyEventId: record.copy_event_id,
      accountId: record.account_id,
      accountName: record.account_name,
      ticket: record.ticket,
      symbol: record.symbol,
      type: record.type,
      volume: record.volume,
      entryPrice: record.entry_price,
      exitPrice: record.exit_price,
      stopLoss: record.stop_loss,
      takeProfit: record.take_profit,
      profit: record.profit,
      status: record.status,
      entryType: record.entry_type ?? 'MARKET',
      openingOrderType: record.opening_order_type,
      positionDirection: record.position_direction,
      closeReason: record.close_reason,
      comment: record.comment,
      openedAt: record.opened_at,
      closedAt: record.closed_at,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
    });
  }
}
