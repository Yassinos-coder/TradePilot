import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';

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

type AccountVisibilitySessions = Record<string, unknown> & {
  hiddenAccountIds?: unknown;
};

@Injectable()
export class AccountsService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly gateway: EaGatewayService,
  ) {}

  async listAccounts(userId: string, includeHidden = false): Promise<AccountDTO[]> {
    const [accountsResult, snapshotsResult, connectionState, hiddenAccountIds] = await Promise.all([
      this.databaseService
        .getClient()
        .from('accounts')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }),
      this.databaseService
        .getClient()
        .from('ea_account_current_status')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1000),
      this.gateway.getConnectionState(userId),
      this.listHiddenAccountIds(userId),
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

    return ((accountsResult.data ?? []) as AccountRecord[])
      .filter((account) => includeHidden || !this.isAccountHidden(account, hiddenAccountIds))
      .map((account) => {
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
          displayName: account.display_name,
          role: account.role ?? 'UNASSIGNED',
          platform: account.platform,
          currency: account.currency,
          leverage: account.leverage,
          hidden: this.isAccountHidden(account, hiddenAccountIds),
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

    return this.toAccountDto(account as AccountRecord, null, []);
  }

  async renameAccount(
    userId: string,
    accountId: string,
    displayName: string | null,
  ): Promise<AccountDTO> {
    const { data, error } = await this.databaseService
      .getClient()
      .from('accounts')
      .update({ display_name: displayName })
      .eq('id', accountId)
      .eq('user_id', userId)
      .select('*')
      .single();

    if (error || !data) {
      throw new NotFoundException('Account was not found');
    }

    const hiddenAccountIds = await this.listHiddenAccountIds(userId);
    return this.toAccountDto(data as AccountRecord, null, hiddenAccountIds);
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

  async hideAccount(userId: string, accountId: string): Promise<AccountDTO> {
    const { data: account, error } = await this.databaseService
      .getClient()
      .from('accounts')
      .select('*')
      .eq('id', accountId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    if (!account) {
      throw new NotFoundException('Account not found');
    }

    const currentHiddenAccountIds = await this.listHiddenAccountIds(userId);
    const hiddenAccountIds = new Set(currentHiddenAccountIds);
    hiddenAccountIds.add(accountId);
    const externalAccountId = (account as AccountRecord).external_account_id;
    if (externalAccountId) {
      hiddenAccountIds.add(externalAccountId);
    }

    const nextHiddenAccountIds = [...hiddenAccountIds];
    await this.saveHiddenAccountIds(userId, nextHiddenAccountIds);

    return this.toAccountDto(account as AccountRecord, null, nextHiddenAccountIds);
  }

  /**
   * Wipes every connected account and all derived data, returning the workspace
   * to a brand-new state. Copier links go too, since they reference accounts
   * that no longer exist.
   *
   * The EAs are untouched: each one re-registers its account on the next
   * heartbeat and starts pushing symbols, status and trades again, so the data
   * rebuilds itself once the terminals reconnect.
   */
  async resetAllAccounts(userId: string): Promise<{ deletedAccounts: number }> {
    const client = this.databaseService.getClient();

    const { data: accounts, error: listError } = await client
      .from('accounts')
      .select('id')
      .eq('user_id', userId);

    if (listError) {
      throw new InternalServerErrorException(listError.message);
    }

    // Ordered so nothing is orphaned: children first, accounts last.
    const tablesInDeletionOrder = [
      'copy_orders',
      'copy_events',
      'copier_links',
      'trade_executions',
      'execution_logs',
      'ea_account_status_snapshots',
      'ea_account_current_status',
      'user_symbols',
      'trade_history_files',
    ];

    for (const table of tablesInDeletionOrder) {
      const { error } = await client.from(table).delete().eq('user_id', userId);

      if (error) {
        throw new InternalServerErrorException(`Failed to clear ${table}: ${error.message}`);
      }
    }

    const { error: accountsError } = await client
      .from('accounts')
      .delete()
      .eq('user_id', userId);

    if (accountsError) {
      throw new InternalServerErrorException(accountsError.message);
    }

    // Hidden-account ids live in the settings jsonb and would otherwise dangle.
    await this.saveHiddenAccountIds(userId, []);

    return { deletedAccounts: (accounts ?? []).length };
  }

  async deleteAccountRecords(userId: string, accountId: string): Promise<void> {
    const client = this.databaseService.getClient();
    const { data: account, error: accountError } = await client
      .from('accounts')
      .select('*')
      .eq('id', accountId)
      .eq('user_id', userId)
      .maybeSingle();

    if (accountError) {
      throw new InternalServerErrorException(accountError.message);
    }

    if (!account) {
      throw new NotFoundException('Account not found');
    }

    const externalAccountId = (account as AccountRecord).external_account_id;
    const accountIds = [accountId, externalAccountId].filter(Boolean) as string[];

    for (const targetAccountId of accountIds) {
      const deleteResults = await Promise.all([
        client.from('trade_executions').delete().eq('user_id', userId).eq('account_id', targetAccountId),
        client.from('execution_logs').delete().eq('user_id', userId).eq('account_id', targetAccountId),
        client.from('ea_account_status_snapshots').delete().eq('user_id', userId).eq('account_id', targetAccountId),
        client.from('ea_account_current_status').delete().eq('user_id', userId).eq('account_id', targetAccountId),
        client.from('user_symbols').delete().eq('user_id', userId).eq('account_id', targetAccountId),
      ]);

      const deleteError = deleteResults.find((result) => result.error)?.error;
      if (deleteError) {
        throw new InternalServerErrorException(deleteError.message);
      }
    }

    const { error: deleteAccountError } = await client
      .from('accounts')
      .delete()
      .eq('id', accountId)
      .eq('user_id', userId);

    if (deleteAccountError) {
      throw new InternalServerErrorException(deleteAccountError.message);
    }

    const hiddenAccountIds = new Set(await this.listHiddenAccountIds(userId));
    for (const id of accountIds) {
      hiddenAccountIds.delete(id);
    }
    await this.saveHiddenAccountIds(userId, [...hiddenAccountIds]);
  }

  async getLatestAccountStatus(
    userId: string,
    accountId?: string,
  ): Promise<AccountStatusDTO | null> {
    let query = this.databaseService
      .getClient()
      .from('ea_account_current_status')
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

  private async listHiddenAccountIds(userId: string): Promise<string[]> {
    const { data, error } = await this.databaseService
      .getClient()
      .from('settings')
      .select('sessions')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return this.extractHiddenAccountIds((data?.sessions ?? {}) as AccountVisibilitySessions);
  }

  private async saveHiddenAccountIds(userId: string, hiddenAccountIds: string[]): Promise<void> {
    const client = this.databaseService.getClient();
    const { data, error } = await client
      .from('settings')
      .select('sessions')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    if (!data) {
      throw new NotFoundException('Settings not found');
    }

    const sessions = ((data.sessions ?? {}) as AccountVisibilitySessions) ?? {};
    const nextSessions = {
      ...sessions,
      hiddenAccountIds: [...new Set(hiddenAccountIds)],
    };

    const { error: updateError } = await client
      .from('settings')
      .update({ sessions: nextSessions })
      .eq('user_id', userId);

    if (updateError) {
      throw new InternalServerErrorException(updateError.message);
    }
  }

  private extractHiddenAccountIds(sessions: AccountVisibilitySessions): string[] {
    if (!Array.isArray(sessions.hiddenAccountIds)) {
      return [];
    }

    return sessions.hiddenAccountIds.filter(
      (accountId): accountId is string => typeof accountId === 'string' && accountId.length > 0,
    );
  }

  private isAccountHidden(account: AccountRecord, hiddenAccountIds: string[]): boolean {
    return hiddenAccountIds.includes(account.id) || Boolean(account.external_account_id && hiddenAccountIds.includes(account.external_account_id));
  }

  private toAccountDto(
    account: AccountRecord,
    latestStatus: AccountStatusDTO | null,
    hiddenAccountIds: string[],
  ): AccountDTO {
    return accountDtoSchema.parse({
      id: account.id,
      externalAccountId: account.external_account_id,
      name: account.name,
      broker: account.broker,
      source: account.source,
      displayName: account.display_name,
      role: account.role ?? 'UNASSIGNED',
      platform: account.platform,
      currency: account.currency,
      leverage: account.leverage,
      hidden: this.isAccountHidden(account, hiddenAccountIds),
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
