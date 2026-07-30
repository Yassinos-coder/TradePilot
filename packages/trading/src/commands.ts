import { OrderSide, WebSocketOutboundMessage } from '@tradepilot/shared';

/**
 * Builders for the EA command messages the copier sends to a slave terminal.
 *
 * Wire field names (`signal_id`, `execution_key`, `stop_loss`, …) are frozen —
 * they are parsed by compiled advisors already deployed in the field.
 * `signal_id` carries the copy event id; `execution_key` correlates the
 * resulting fill back to its copy_orders row.
 */

export interface OpenCommandInput {
  symbol: string;
  side: OrderSide;
  volume: number;
  entryPrice?: number | null;
  stopLoss?: number | null;
  takeProfit?: number | null;
  copyEventId: string;
  executionKey: string;
}

export interface CloseCommandInput {
  symbol?: string;
  ticket?: string | null;
  copyEventId: string;
  executionKey: string;
}

export interface PartialCloseCommandInput extends CloseCommandInput {
  percent: number;
}

export interface ModifyCommandInput extends CloseCommandInput {
  stopLoss?: number | null;
  takeProfit?: number | null;
}

/** MARKET when no entry price is supplied, LIMIT otherwise. */
export function buildOpenCommand(input: OpenCommandInput): WebSocketOutboundMessage {
  return {
    type: 'signal',
    data: [
      {
        symbol: input.symbol,
        type: input.side,
        entry: input.entryPrice ? 'LIMIT' : 'MARKET',
        volume: input.volume,
        entry_price: input.entryPrice ?? null,
        stop_loss: input.stopLoss ?? null,
        take_profit: input.takeProfit ?? null,
        signal_id: input.copyEventId,
        execution_key: input.executionKey,
      },
    ],
  };
}

export function buildCloseCommand(input: CloseCommandInput): WebSocketOutboundMessage {
  return {
    type: 'close_all',
    ...(input.ticket ? { ticket: input.ticket } : {}),
    ...(input.symbol ? { symbol: input.symbol } : {}),
    signal_id: input.copyEventId,
    execution_key: input.executionKey,
  };
}

export function buildPartialCloseCommand(
  input: PartialCloseCommandInput,
): WebSocketOutboundMessage {
  return {
    type: 'partial_close',
    ...(input.ticket ? { ticket: input.ticket } : {}),
    ...(input.symbol ? { symbol: input.symbol } : {}),
    percent: input.percent,
    signal_id: input.copyEventId,
    execution_key: input.executionKey,
  };
}

export function buildModifyCommand(input: ModifyCommandInput): WebSocketOutboundMessage {
  return {
    type: 'move_sl',
    ...(input.ticket ? { ticket: input.ticket } : {}),
    ...(input.symbol ? { symbol: input.symbol } : {}),
    new_stop_loss: input.stopLoss ?? null,
    new_take_profit: input.takeProfit ?? null,
    signal_id: input.copyEventId,
    execution_key: input.executionKey,
  };
}

/** Flip a side for links configured with reverseCopy. */
export function invertSide(side: OrderSide): OrderSide {
  return side === 'BUY' ? 'SELL' : 'BUY';
}
