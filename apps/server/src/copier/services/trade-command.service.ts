import { Injectable, InternalServerErrorException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';

import { EA_DISPATCH_ACK_PREFIX, EA_DISPATCH_CHANNEL } from '@tradepilot/config';
import {
  TradeApiCloseInput,
  TradeApiCommandResult,
  TradeApiModifyInput,
  TradeApiOpenInput,
  TradeExecutionDTO,
  WebSocketOutboundMessage,
  tradeApiCommandResultSchema,
} from '@tradepilot/shared';

import { TradeExecutionMapper } from '../../common/mappers/trade-execution.mapper';
import { DatabaseService } from '../../database/database.service';
import { TradeExecutionRecord } from '../../database/database.types';
import { DispatchAckMessage, DispatchEventMessage } from '../../ea/interfaces/ea.interfaces';
import { DispatchIntentService } from '../../ea/services/dispatch-intent.service';
import { EaPresenceService } from '../../ea/services/ea-presence.service';
import { RedisService } from '../../redis/redis.service';

/**
 * Turns HTTP trade-API calls into EA commands.
 *
 * Dispatch goes through the same Redis channel the copier uses, so whichever API
 * instance holds the terminal's socket delivers the command; delivery is then
 * confirmed by waiting for that instance's ack.
 */
@Injectable()
export class TradeCommandService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly redisService: RedisService,
    private readonly presenceService: EaPresenceService,
    private readonly dispatchIntentService: DispatchIntentService,
    private readonly configService: ConfigService,
  ) {}

  async listOpenPositions(userId: string, accountId: string): Promise<TradeExecutionDTO[]> {
    // Read-through of the stored state, which the EA keeps current by pushing a
    // trade_event on every transaction.
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
      TradeExecutionMapper.toDto(trade),
    );
  }

  async openPosition(userId: string, input: TradeApiOpenInput): Promise<TradeApiCommandResult> {
    const requestId = randomUUID();

    // Unlike a copy, an API caller can ask for a limit or stop order.
    await this.dispatchIntentService.remember(this.buildExecutionKey(requestId), input.entry);

    return this.dispatch(userId, input.accountId, input.symbol, requestId, {
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
          execution_key: this.buildExecutionKey(requestId),
        },
      ],
    });
  }

  async closePosition(userId: string, input: TradeApiCloseInput): Promise<TradeApiCommandResult> {
    const requestId = randomUUID();
    const message: WebSocketOutboundMessage =
      input.percent >= 100
        ? {
            type: 'close_all',
            ...(input.symbol ? { symbol: input.symbol } : {}),
            ...(input.ticket ? { ticket: input.ticket } : {}),
            execution_key: this.buildExecutionKey(requestId),
          }
        : {
            type: 'partial_close',
            ...(input.symbol ? { symbol: input.symbol } : {}),
            ...(input.ticket ? { ticket: input.ticket } : {}),
            percent: input.percent,
            execution_key: this.buildExecutionKey(requestId),
          };

    return this.dispatch(userId, input.accountId, input.symbol ?? '', requestId, message);
  }

  async modifyPosition(userId: string, input: TradeApiModifyInput): Promise<TradeApiCommandResult> {
    const requestId = randomUUID();

    return this.dispatch(userId, input.accountId, input.symbol ?? '', requestId, {
      type: 'move_sl',
      ...(input.symbol ? { symbol: input.symbol } : {}),
      ...(input.ticket ? { ticket: input.ticket } : {}),
      new_stop_loss: input.stopLoss ?? null,
      new_take_profit: input.takeProfit ?? null,
      execution_key: this.buildExecutionKey(requestId),
    });
  }

  private async dispatch(
    userId: string,
    accountId: string,
    symbol: string,
    requestId: string,
    message: WebSocketOutboundMessage,
  ): Promise<TradeApiCommandResult> {
    const online = await this.presenceService.isOnline(userId, accountId);

    if (!online) {
      throw new ServiceUnavailableException(`EA account ${accountId} is offline`);
    }

    const eventId = randomUUID();
    const executionKey = this.buildExecutionKey(requestId);
    const ackTimeoutMs = this.configService.get<number>('EA_DISPATCH_ACK_TIMEOUT_MS') ?? 2_000;
    const ackChannel = `${EA_DISPATCH_ACK_PREFIX}:${eventId}`;

    const event: DispatchEventMessage = {
      eventId,
      executionKey,
      copyEventId: null,
      userId,
      commands: [
        {
          accountId,
          accountName: null,
          requestedSymbol: symbol,
          resolvedSymbol: symbol,
          message,
        },
      ],
    };

    // The gateway may be in this very process and ack within a millisecond, so
    // the subscription has to be live before the publish goes out.
    const rawAck = await this.redisService.awaitMessageAfter(
      ackChannel,
      ackTimeoutMs,
      () => this.redisService.publish(EA_DISPATCH_CHANNEL, JSON.stringify(event)),
    );

    if (!rawAck) {
      throw new ServiceUnavailableException(
        `EA account ${accountId} did not acknowledge the command within ${ackTimeoutMs} ms. ` +
          'It may still have been delivered — check the terminal and your open positions before retrying.',
      );
    }

    const ack = this.tryParseAck(rawAck);

    if (!ack?.delivered || ack.deliveredCount === 0) {
      throw new ServiceUnavailableException(`EA account ${accountId} rejected the command`);
    }

    return tradeApiCommandResultSchema.parse({
      requestId,
      accountId,
      status: 'DELIVERED',
      message:
        'Command delivered to the connected EA. Check execution logs and trades for the terminal result.',
    });
  }

  private buildExecutionKey(requestId: string): string {
    return `api${requestId.replace(/-/g, '').slice(0, 20)}`;
  }

  private tryParseAck(raw: string): DispatchAckMessage | null {
    try {
      return JSON.parse(raw) as DispatchAckMessage;
    } catch {
      return null;
    }
  }
}
