import { Injectable, InternalServerErrorException } from '@nestjs/common';

import {
  AccountDTO,
  AccountStatusDTO,
  CreateAccountInput,
  accountDtoSchema,
  accountStatusDtoSchema,
} from '@tradepilot/shared';

import { DatabaseService } from '../database/database.service';
import {
  AccountRecord,
  AccountStatusSnapshotRecord,
} from '../database/database.types';
import { EaGatewayService } from '../ea/ea-gateway.service';

@Injectable()
export class AccountsService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly gateway: EaGatewayService,
  ) {}

  async listAccounts(userId: string): Promise<AccountDTO[]> {
    const [accountsResult, snapshotsResult, connectionState] = await Promise.all([
      this.databaseService
        .getClient()
        .from('accounts')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }),
      this.databaseService
        .getClient()
        .from('ea_account_status_snapshots')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(250),
      this.gateway.getConnectionState(userId),
    ]);

    if (accountsResult.error) {
      throw new InternalServerErrorException(accountsResult.error.message);
    }

    if (snapshotsResult.error) {
      throw new InternalServerErrorException(snapshotsResult.error.message);
    }

    const latestStatusByAccount = new Map<string, AccountStatusSnapshotRecord>();

    for (const snapshot of (snapshotsResult.data ?? []) as AccountStatusSnapshotRecord[]) {
      if (!latestStatusByAccount.has(snapshot.account_id)) {
        latestStatusByAccount.set(snapshot.account_id, snapshot);
      }
    }

    const liveAccounts = new Map(
      connectionState.accounts.map((account) => [account.accountId, account]),
    );

    return ((accountsResult.data ?? []) as AccountRecord[]).map((account) => {
      const externalAccountId = account.external_account_id ?? null;
      const live = externalAccountId ? liveAccounts.get(externalAccountId) : null;
      const latestStatus =
        externalAccountId && latestStatusByAccount.has(externalAccountId)
          ? this.toAccountStatusDto(latestStatusByAccount.get(externalAccountId)!)
          : null;

      return accountDtoSchema.parse({
        id: account.id,
        externalAccountId,
        name: account.name,
        broker: account.broker,
        source: account.source,
        online: Boolean(live),
        latencyMs: live?.latencyMs ?? account.latency_ms ?? null,
        lastSeenAt: live?.lastSeenAt ?? account.last_seen_at ?? latestStatus?.reportedAt ?? null,
        latestStatus,
        createdAt: account.created_at,
      });
    });
  }

  async createAccount(userId: string, payload: CreateAccountInput): Promise<AccountDTO> {
    const { data: account, error } = await this.databaseService
      .getClient()
      .from('accounts')
      .insert({
        user_id: userId,
        name: payload.name,
        broker: payload.broker,
        source: 'MANUAL',
      })
      .select('*')
      .single();

    if (error || !account) {
      throw new InternalServerErrorException(error?.message ?? 'Failed to create account');
    }

    return this.toAccountDto(account as AccountRecord, null);
  }

  async deleteAccount(userId: string, accountId: string): Promise<void> {
    const { error } = await this.databaseService
      .getClient()
      .from('accounts')
      .delete()
      .eq('id', accountId)
      .eq('user_id', userId);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }
  }

  async getLatestAccountStatus(
    userId: string,
    accountId?: string,
  ): Promise<AccountStatusDTO | null> {
    let query = this.databaseService
      .getClient()
      .from('ea_account_status_snapshots')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (accountId) {
      query = query.eq('account_id', accountId);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    if (!data) {
      return null;
    }

    return this.toAccountStatusDto(data as AccountStatusSnapshotRecord);
  }

  async listAccountStatusHistory(
    userId: string,
    limit = 50,
    accountId?: string,
  ): Promise<AccountStatusDTO[]> {
    let query = this.databaseService
      .getClient()
      .from('ea_account_status_snapshots')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (accountId) {
      query = query.eq('account_id', accountId);
    }

    const { data, error } = await query;

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return (data ?? []).map((snapshot) =>
      this.toAccountStatusDto(snapshot as AccountStatusSnapshotRecord),
    );
  }

  private toAccountDto(
    account: AccountRecord,
    latestStatus: AccountStatusDTO | null,
  ): AccountDTO {
    return accountDtoSchema.parse({
      id: account.id,
      externalAccountId: account.external_account_id,
      name: account.name,
      broker: account.broker,
      source: account.source,
      online: false,
      latencyMs: account.latency_ms,
      lastSeenAt: account.last_seen_at,
      latestStatus,
      createdAt: account.created_at,
    });
  }

  private toAccountStatusDto(accountStatus: AccountStatusSnapshotRecord): AccountStatusDTO {
    return accountStatusDtoSchema.parse({
      accountId: accountStatus.account_id,
      accountName: accountStatus.account_name,
      balance: accountStatus.balance,
      equity: accountStatus.equity,
      margin: accountStatus.margin,
      freeMargin: accountStatus.free_margin,
      drawdownPercent: accountStatus.drawdown_percent,
      openPositions: accountStatus.open_positions,
      reportedAt: accountStatus.created_at,
    });
  }
}
