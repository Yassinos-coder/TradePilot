import { Injectable, InternalServerErrorException } from '@nestjs/common';

import { DatabaseService } from '../../database/database.service';
import { CopierLinkRecord } from '../../database/database.types';

@Injectable()
export class CopierLinkRepository {
  private readonly tableName = 'copier_links';

  constructor(private readonly databaseService: DatabaseService) {}

  async findById(userId: string, linkId: string): Promise<CopierLinkRecord | null> {
    const { data, error } = await this.databaseService
      .getClient()
      .from(this.tableName)
      .select('*')
      .eq('id', linkId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(`Failed to load copier link: ${error.message}`);
    }

    return (data as CopierLinkRecord | null) ?? null;
  }

  async listByUser(userId: string): Promise<CopierLinkRecord[]> {
    const { data, error } = await this.databaseService
      .getClient()
      .from(this.tableName)
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) {
      throw new InternalServerErrorException(`Failed to list copier links: ${error.message}`);
    }

    return (data ?? []) as CopierLinkRecord[];
  }

  /** Only enabled links — the fan-out hot path. */
  async listEnabledByMaster(masterAccountId: string): Promise<CopierLinkRecord[]> {
    const { data, error } = await this.databaseService
      .getClient()
      .from(this.tableName)
      .select('*')
      .eq('master_account_id', masterAccountId)
      .eq('enabled', true);

    if (error) {
      throw new InternalServerErrorException(
        `Failed to list enabled copier links: ${error.message}`,
      );
    }

    return (data ?? []) as CopierLinkRecord[];
  }

  /** Every link where this account plays either side — master or slave. */
  async listByAccountId(accountId: string): Promise<CopierLinkRecord[]> {
    const { data, error } = await this.databaseService
      .getClient()
      .from(this.tableName)
      .select('*')
      .or(`master_account_id.eq.${accountId},slave_account_id.eq.${accountId}`);

    if (error) {
      throw new InternalServerErrorException(
        `Failed to list copier links for account: ${error.message}`,
      );
    }

    return (data ?? []) as CopierLinkRecord[];
  }

  async insert(payload: Record<string, unknown>): Promise<CopierLinkRecord> {
    const { data, error } = await this.databaseService
      .getClient()
      .from(this.tableName)
      .insert(payload)
      .select('*')
      .single();

    if (error || !data) {
      throw new InternalServerErrorException(
        `Failed to create copier link: ${error?.message ?? 'no row returned'}`,
      );
    }

    return data as CopierLinkRecord;
  }

  async update(linkId: string, patch: Record<string, unknown>): Promise<CopierLinkRecord> {
    const { data, error } = await this.databaseService
      .getClient()
      .from(this.tableName)
      .update(patch)
      .eq('id', linkId)
      .select('*')
      .single();

    if (error || !data) {
      throw new InternalServerErrorException(
        `Failed to update copier link: ${error?.message ?? 'no row returned'}`,
      );
    }

    return data as CopierLinkRecord;
  }

  async remove(linkId: string): Promise<void> {
    const { error } = await this.databaseService
      .getClient()
      .from(this.tableName)
      .delete()
      .eq('id', linkId);

    if (error) {
      throw new InternalServerErrorException(`Failed to delete copier link: ${error.message}`);
    }
  }

  async removeBySlaveAccount(slaveAccountId: string): Promise<void> {
    const { error } = await this.databaseService
      .getClient()
      .from(this.tableName)
      .delete()
      .eq('slave_account_id', slaveAccountId);

    if (error) {
      throw new InternalServerErrorException(`Failed to delete copier links: ${error.message}`);
    }
  }
}
