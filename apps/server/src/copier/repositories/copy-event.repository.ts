import { Injectable, InternalServerErrorException } from '@nestjs/common';

import { COPY_EVENT_FEED_LIMIT } from '@tradepilot/config';

import { DatabaseService } from '../../database/database.service';
import { CopyEventRecord } from '../../database/database.types';
import { MasterEvent } from '../interfaces/copier.interfaces';

@Injectable()
export class CopyEventRepository {
  private readonly tableName = 'copy_events';

  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Inserts the event, or returns null when the master EA resent a transaction
   * we already fanned out (unique index on master account + ticket + action).
   */
  async insertIfNew(event: MasterEvent): Promise<CopyEventRecord | null> {
    const { data, error } = await this.databaseService
      .getClient()
      .from(this.tableName)
      .insert({
        user_id: event.userId,
        master_account_id: event.masterAccountId,
        master_ticket: event.masterTicket,
        action: event.action,
        symbol: event.symbol,
        base_symbol: event.baseSymbol,
        side: event.side,
        volume: event.volume,
        entry_price: event.entryPrice,
        stop_loss: event.stopLoss,
        take_profit: event.takeProfit,
        close_percent: event.closePercent,
        master_event_at: event.masterEventAt,
      })
      .select('*')
      .single();

    if (error) {
      if (this.isUniqueViolation(error.message)) {
        return null;
      }

      throw new InternalServerErrorException(`Failed to record copy event: ${error.message}`);
    }

    return data as CopyEventRecord;
  }

  async listByUser(userId: string, limit = COPY_EVENT_FEED_LIMIT): Promise<CopyEventRecord[]> {
    const { data, error } = await this.databaseService
      .getClient()
      .from(this.tableName)
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new InternalServerErrorException(`Failed to list copy events: ${error.message}`);
    }

    return (data ?? []) as CopyEventRecord[];
  }

  async countSince(userId: string, sinceIso: string): Promise<number> {
    const { count, error } = await this.databaseService
      .getClient()
      .from(this.tableName)
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', sinceIso);

    if (error) {
      throw new InternalServerErrorException(`Failed to count copy events: ${error.message}`);
    }

    return count ?? 0;
  }

  private isUniqueViolation(message: string): boolean {
    const normalized = message.toLowerCase();
    return normalized.includes('duplicate key') || normalized.includes('unique constraint');
  }
}
