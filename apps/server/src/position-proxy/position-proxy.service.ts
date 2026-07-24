import { Injectable, InternalServerErrorException, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  PositionProxyCloseInput,
  PositionProxyCommandResult,
  PositionProxyModifyInput,
  PositionProxyOpenInput,
  TradeExecutionDTO,
  WebSocketOutboundMessage,
  positionProxyCommandResultSchema,
  tradeExecutionDtoSchema,
} from '@tradepilot/shared';

import { DatabaseService } from '../database/database.service';
import { TradeExecutionRecord } from '../database/database.types';
import { EaGatewayService } from '../ea/ea-gateway.service';

@Injectable()
export class PositionProxyService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly gateway: EaGatewayService,
  ) {}

  async listOpenPositions(userId: string, accountId: string): Promise<TradeExecutionDTO[]> {
    await this.gateway.requestStateSync(userId, accountId);

    const { data, error } = await this.databaseService
      .getClient()
      .from('trade_executions')
      .select('*')
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .eq('status', 'OPEN')
      .order('updated_at', { ascending: false });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return ((data ?? []) as TradeExecutionRecord[]).map((trade) =>
      tradeExecutionDtoSchema.parse({
        id: trade.id,
        signalId: trade.signal_id,
        accountId: trade.account_id,
        accountName: trade.account_name,
        ticket: trade.ticket,
        symbol: trade.symbol,
        type: trade.type,
        volume: trade.volume,
        entryPrice: trade.entry_price,
        exitPrice: trade.exit_price,
        stopLoss: trade.stop_loss,
        takeProfit: trade.take_profit,
        profit: trade.profit,
        status: trade.status,
        openingOrderType: trade.opening_order_type,
        positionDirection: trade.position_direction,
        closeReason: trade.close_reason,
        comment: trade.comment,
        openedAt: trade.opened_at,
        closedAt: trade.closed_at,
        createdAt: trade.created_at,
        updatedAt: trade.updated_at,
      }),
    );
  }

  async openPosition(userId: string, input: PositionProxyOpenInput): Promise<PositionProxyCommandResult> {
    const requestId = randomUUID();
    const message: WebSocketOutboundMessage = {
      type: 'signal',
      data: [
        {
          symbol: input.symbol,
          type: input.side,
          entry: input.entry,
          volume: input.volume,
          entry_price: input.entryPrice ?? null,
          stop_loss: input.stopLoss ?? null,
          take_profit: input.takeProfit ?? null,
          execution_key: `proxy:${requestId}`,
        },
      ],
    };

    return this.dispatch(userId, input.accountId, requestId, message);
  }

  async closePosition(userId: string, input: PositionProxyCloseInput): Promise<PositionProxyCommandResult> {
    const requestId = randomUUID();
    const message: WebSocketOutboundMessage = input.percent >= 100
      ? {
          type: 'close_all',
          symbol: input.symbol,
          ticket: input.ticket,
          execution_key: `proxy:${requestId}`,
        }
      : {
          type: 'partial_close',
          symbol: input.symbol,
          ticket: input.ticket,
          percent: input.percent,
          execution_key: `proxy:${requestId}`,
        };

    return this.dispatch(userId, input.accountId, requestId, message);
  }

  async modifyPosition(userId: string, input: PositionProxyModifyInput): Promise<PositionProxyCommandResult> {
    const requestId = randomUUID();
    const message: WebSocketOutboundMessage = {
      type: 'move_sl',
      symbol: input.symbol,
      ticket: input.ticket,
      new_stop_loss: input.stopLoss ?? null,
      new_take_profit: input.takeProfit ?? null,
      execution_key: `proxy:${requestId}`,
    };

    return this.dispatch(userId, input.accountId, requestId, message);
  }

  private async dispatch(
    userId: string,
    accountId: string,
    requestId: string,
    message: WebSocketOutboundMessage,
  ): Promise<PositionProxyCommandResult> {
    const delivered = await this.gateway.dispatchProxyCommand(userId, accountId, message);

    if (!delivered) {
      throw new ServiceUnavailableException(`EA account ${accountId} is offline`);
    }

    return positionProxyCommandResultSchema.parse({
      requestId,
      accountId,
      status: 'DELIVERED',
      message: 'Command delivered to the connected EA. Check execution logs/trades for the terminal result.',
    });
  }
}
