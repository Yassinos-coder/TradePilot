import { Injectable, InternalServerErrorException } from '@nestjs/common';

import { DatabaseService } from '../../database/database.service';
import { CopyOrderRecord, CopyOrderStatus } from '../../database/database.types';

@Injectable()
export class CopyOrderRepository {
  private readonly tableName = 'copy_orders';

  constructor(private readonly databaseService: DatabaseService) {}

  async insert(payload: Record<string, unknown>): Promise<CopyOrderRecord> {
    const { data, error } = await this.databaseService
      .getClient()
      .from(this.tableName)
      .insert(payload)
      .select('*')
      .single();

    if (error || !data) {
      throw new InternalServerErrorException(
        `Failed to record copy order: ${error?.message ?? 'no row returned'}`,
      );
    }

    return data as CopyOrderRecord;
  }

  async listByEventIds(eventIds: string[]): Promise<CopyOrderRecord[]> {
    if (eventIds.length === 0) {
      return [];
    }

    const { data, error } = await this.databaseService
      .getClient()
      .from(this.tableName)
      .select('*')
      .in('copy_event_id', eventIds)
      .order('created_at', { ascending: true });

    if (error) {
      throw new InternalServerErrorException(`Failed to list copy orders: ${error.message}`);
    }

    return (data ?? []) as CopyOrderRecord[];
  }

  /**
   * The master ↔ slave ticket map: which position on this slave mirrors the
   * given master ticket? Latest filled open first.
   */
  async findSlaveTicket(
    copierLinkId: string,
    masterTicket: string,
  ): Promise<CopyOrderRecord | null> {
    const { data, error } = await this.databaseService
      .getClient()
      .from(this.tableName)
      .select('*')
      .eq('copier_link_id', copierLinkId)
      .eq('master_ticket', masterTicket)
      .not('slave_ticket', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(`Failed to resolve slave ticket: ${error.message}`);
    }

    return (data as CopyOrderRecord | null) ?? null;
  }

  async findByExecutionKey(executionKey: string): Promise<CopyOrderRecord | null> {
    const { data, error } = await this.databaseService
      .getClient()
      .from(this.tableName)
      .select('*')
      .eq('execution_key', executionKey)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(`Failed to load copy order: ${error.message}`);
    }

    return (data as CopyOrderRecord | null) ?? null;
  }

  async updateStatus(
    orderId: string,
    status: CopyOrderStatus,
    patch: Record<string, unknown> = {},
  ): Promise<void> {
    const { error } = await this.databaseService
      .getClient()
      .from(this.tableName)
      .update({ status, ...patch })
      .eq('id', orderId);

    if (error) {
      throw new InternalServerErrorException(`Failed to update copy order: ${error.message}`);
    }
  }

  async countByStatusSince(
    userId: string,
    sinceIso: string,
  ): Promise<Record<CopyOrderStatus, number>> {
    const { data, error } = await this.databaseService
      .getClient()
      .from(this.tableName)
      .select('status')
      .eq('user_id', userId)
      .gte('created_at', sinceIso);

    if (error) {
      throw new InternalServerErrorException(`Failed to count copy orders: ${error.message}`);
    }

    const tally: Record<CopyOrderStatus, number> = {
      PENDING: 0,
      SENT: 0,
      FILLED: 0,
      SKIPPED: 0,
      REJECTED: 0,
      FAILED: 0,
    };

    for (const row of (data ?? []) as Array<{ status: CopyOrderStatus }>) {
      tally[row.status] = (tally[row.status] ?? 0) + 1;
    }

    return tally;
  }

  async countByLinkSince(
    linkIds: string[],
    sinceIso: string,
  ): Promise<Map<string, { count: number; lastAt: string | null }>> {
    const summary = new Map<string, { count: number; lastAt: string | null }>();

    if (linkIds.length === 0) {
      return summary;
    }

    const { data, error } = await this.databaseService
      .getClient()
      .from(this.tableName)
      .select('copier_link_id,created_at')
      .in('copier_link_id', linkIds)
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false });

    if (error) {
      throw new InternalServerErrorException(`Failed to summarise copy orders: ${error.message}`);
    }

    for (const row of (data ?? []) as Array<{ copier_link_id: string; created_at: string }>) {
      const existing = summary.get(row.copier_link_id);

      if (existing) {
        existing.count += 1;
        continue;
      }

      // Rows arrive newest-first, so the first one seen is the latest.
      summary.set(row.copier_link_id, { count: 1, lastAt: row.created_at });
    }

    return summary;
  }
}
