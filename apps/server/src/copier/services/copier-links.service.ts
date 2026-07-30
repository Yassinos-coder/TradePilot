import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

import { COPY_EVENT_FEED_LIMIT } from '@tradepilot/config';
import {
  CopierLinkDTO,
  CopierOverviewDTO,
  CopyEventDTO,
  CreateCopierLinkInput,
  UpdateCopierLinkInput,
  copierOverviewSchema,
} from '@tradepilot/shared';

import { DatabaseService } from '../../database/database.service';
import { AccountRecord, CopyOrderRecord } from '../../database/database.types';
import { EaPresenceService } from '../../ea/services/ea-presence.service';
import { SettingsService } from '../../settings/settings.service';
import { CopierMapper } from '../mappers/copier.mapper';
import { CopierLinkRepository } from '../repositories/copier-link.repository';
import { CopyEventRepository } from '../repositories/copy-event.repository';
import { CopyOrderRepository } from '../repositories/copy-order.repository';

@Injectable()
export class CopierLinksService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly copierLinkRepository: CopierLinkRepository,
    private readonly copyEventRepository: CopyEventRepository,
    private readonly copyOrderRepository: CopyOrderRepository,
    private readonly presenceService: EaPresenceService,
    private readonly settingsService: SettingsService,
  ) {}

  async listLinks(userId: string): Promise<CopierLinkDTO[]> {
    const links = await this.copierLinkRepository.listByUser(userId);

    if (links.length === 0) {
      return [];
    }

    const accounts = await this.loadAccounts(userId);
    const onlineIds = await this.presenceService.listOnlineAccountIds(userId);
    const summary = await this.copyOrderRepository.countByLinkSince(
      links.map((link) => link.id),
      this.startOfUtcDay(),
    );

    return links.map((link) => {
      const slaveAccount = accounts.get(link.slave_account_id) ?? null;
      const linkSummary = summary.get(link.id);

      return CopierMapper.toLinkDto(link, {
        slaveAccount,
        slaveOnline: Boolean(
          slaveAccount?.external_account_id &&
            onlineIds.has(slaveAccount.external_account_id),
        ),
        copiesToday: linkSummary?.count ?? 0,
        lastCopyAt: linkSummary?.lastAt ?? null,
      });
    });
  }

  async createLink(userId: string, input: CreateCopierLinkInput): Promise<CopierLinkDTO> {
    const master = await this.findMasterAccount(userId);

    if (!master) {
      throw new BadRequestException(
        'Designate a master account before creating a copier link',
      );
    }

    if (master.id === input.slaveAccountId) {
      throw new BadRequestException('The master account cannot also be a slave');
    }

    const slave = await this.findAccount(userId, input.slaveAccountId);

    if (!slave) {
      throw new NotFoundException('Slave account was not found');
    }

    const existing = await this.copierLinkRepository.listByUser(userId);

    if (existing.some((link) => link.slave_account_id === input.slaveAccountId)) {
      throw new ConflictException('This account is already linked to your master');
    }

    const { slaveAccountId, enabled, ...riskParams } = input;

    const record = await this.copierLinkRepository.insert({
      user_id: userId,
      master_account_id: master.id,
      slave_account_id: slaveAccountId,
      enabled,
      ...CopierMapper.toRiskColumns(riskParams),
    });

    await this.setAccountRole(slaveAccountId, 'SLAVE');

    return CopierMapper.toLinkDto(record, {
      slaveAccount: slave,
      slaveOnline: false,
      copiesToday: 0,
      lastCopyAt: null,
    });
  }

  async updateLink(
    userId: string,
    linkId: string,
    input: UpdateCopierLinkInput,
  ): Promise<CopierLinkDTO> {
    const existing = await this.copierLinkRepository.findById(userId, linkId);

    if (!existing) {
      throw new NotFoundException('Copier link was not found');
    }

    const { enabled, ...riskParams } = input;
    const patch: Record<string, unknown> = {
      ...CopierMapper.toRiskColumns(riskParams),
      ...(enabled === undefined ? {} : { enabled }),
    };

    // Validate the merged result so a partial update cannot leave the link in a
    // state its sizing mode cannot satisfy.
    const merged = { ...CopierMapper.toRiskParams(existing), ...riskParams };

    if (merged.sizingMode === 'FIXED_LOT' && merged.fixedLot === null) {
      throw new BadRequestException('FIXED_LOT sizing requires a fixed lot');
    }

    if (merged.sizingMode === 'RISK_PERCENT' && merged.riskPercent === null) {
      throw new BadRequestException('RISK_PERCENT sizing requires a risk percent');
    }

    if (merged.maxLot < merged.minLot) {
      throw new BadRequestException('Max lot must be greater than or equal to min lot');
    }

    const record =
      Object.keys(patch).length > 0
        ? await this.copierLinkRepository.update(linkId, patch)
        : existing;

    const accounts = await this.loadAccounts(userId);
    const onlineIds = await this.presenceService.listOnlineAccountIds(userId);
    const slaveAccount = accounts.get(record.slave_account_id) ?? null;

    return CopierMapper.toLinkDto(record, {
      slaveAccount,
      slaveOnline: Boolean(
        slaveAccount?.external_account_id && onlineIds.has(slaveAccount.external_account_id),
      ),
      copiesToday: 0,
      lastCopyAt: null,
    });
  }

  async deleteLink(userId: string, linkId: string): Promise<void> {
    const existing = await this.copierLinkRepository.findById(userId, linkId);

    if (!existing) {
      throw new NotFoundException('Copier link was not found');
    }

    await this.copierLinkRepository.remove(linkId);
    await this.setAccountRole(existing.slave_account_id, 'UNASSIGNED');
  }

  /**
   * Promotes one account to MASTER, demoting the previous one. Passing null
   * clears the master and removes every link, since links are meaningless
   * without one.
   */
  async setMasterAccount(userId: string, accountId: string | null): Promise<void> {
    const client = this.databaseService.getClient();
    const previousMaster = await this.findMasterAccount(userId);

    if (previousMaster && previousMaster.id !== accountId) {
      const { error } = await client
        .from('accounts')
        .update({ role: 'UNASSIGNED' })
        .eq('id', previousMaster.id);

      if (error) {
        throw new InternalServerErrorException(`Failed to demote master: ${error.message}`);
      }
    }

    if (!accountId) {
      const links = await this.copierLinkRepository.listByUser(userId);

      for (const link of links) {
        await this.copierLinkRepository.remove(link.id);
        await this.setAccountRole(link.slave_account_id, 'UNASSIGNED');
      }

      return;
    }

    const account = await this.findAccount(userId, accountId);

    if (!account) {
      throw new NotFoundException('Account was not found');
    }

    // An account cannot be its own slave, so drop any link pointing at it.
    await this.copierLinkRepository.removeBySlaveAccount(accountId);

    const { error } = await client
      .from('accounts')
      .update({ role: 'MASTER' })
      .eq('id', accountId)
      .eq('user_id', userId);

    if (error) {
      throw new InternalServerErrorException(`Failed to set master: ${error.message}`);
    }
  }

  async listCopyEvents(userId: string, limit = COPY_EVENT_FEED_LIMIT): Promise<CopyEventDTO[]> {
    const events = await this.copyEventRepository.listByUser(userId, limit);

    if (events.length === 0) {
      return [];
    }

    const orders = await this.copyOrderRepository.listByEventIds(events.map((event) => event.id));
    const accounts = await this.loadAccounts(userId);
    const ordersByEvent = new Map<string, CopyOrderRecord[]>();

    for (const order of orders) {
      const bucket = ordersByEvent.get(order.copy_event_id) ?? [];
      bucket.push(order);
      ordersByEvent.set(order.copy_event_id, bucket);
    }

    return events.map((event) =>
      CopierMapper.toCopyEventDto(event, {
        masterAccountName: accounts.get(event.master_account_id)?.name ?? null,
        orders: (ordersByEvent.get(event.id) ?? []).map((order) =>
          CopierMapper.toCopyOrderDto(
            order,
            accounts.get(order.slave_account_id)?.name ?? null,
          ),
        ),
      }),
    );
  }

  async getOverview(userId: string): Promise<CopierOverviewDTO> {
    const dayStart = this.startOfUtcDay();
    const [master, links, onlineIds, eventsToday, statusTally] = await Promise.all([
      this.findMasterAccount(userId),
      this.copierLinkRepository.listByUser(userId),
      this.presenceService.listOnlineAccountIds(userId),
      this.copyEventRepository.countSince(userId, dayStart),
      this.copyOrderRepository.countByStatusSince(userId, dayStart),
    ]);

    const accounts = await this.loadAccounts(userId);
    const slavesOnline = links.filter((link) => {
      const externalId = accounts.get(link.slave_account_id)?.external_account_id;
      return Boolean(externalId && onlineIds.has(externalId));
    }).length;

    const filled = statusTally.FILLED + statusTally.SENT;
    const failed = statusTally.REJECTED + statusTally.FAILED;
    const attempted = filled + failed;

    const recentEvents = await this.copyEventRepository.listByUser(userId, 1);

    return copierOverviewSchema.parse({
      masterAccountId: master?.id ?? null,
      masterAccountName: master?.name ?? null,
      masterOnline: Boolean(
        master?.external_account_id && onlineIds.has(master.external_account_id),
      ),
      totalLinks: links.length,
      activeLinks: links.filter((link) => link.enabled).length,
      slavesOnline,
      copyEventsToday: eventsToday,
      copiesFilledToday: filled,
      copiesSkippedToday: statusTally.SKIPPED,
      copiesFailedToday: failed,
      copySuccessRate: attempted === 0 ? null : (filled / attempted) * 100,
      lastCopyAt: recentEvents[0]?.created_at ?? null,
    });
  }

  async findMasterAccount(userId: string): Promise<AccountRecord | null> {
    const { data, error } = await this.databaseService
      .getClient()
      .from('accounts')
      .select('*')
      .eq('user_id', userId)
      .eq('role', 'MASTER')
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(`Failed to load master account: ${error.message}`);
    }

    return (data as AccountRecord | null) ?? null;
  }

  /** Resolves the MASTER account for a terminal's external id, if it is one. */
  async findMasterByExternalId(
    userId: string,
    externalAccountId: string,
  ): Promise<AccountRecord | null> {
    const { data, error } = await this.databaseService
      .getClient()
      .from('accounts')
      .select('*')
      .eq('user_id', userId)
      .eq('external_account_id', externalAccountId)
      .eq('role', 'MASTER')
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(`Failed to resolve master: ${error.message}`);
    }

    return (data as AccountRecord | null) ?? null;
  }

  private async findAccount(userId: string, accountId: string): Promise<AccountRecord | null> {
    const { data, error } = await this.databaseService
      .getClient()
      .from('accounts')
      .select('*')
      .eq('id', accountId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(`Failed to load account: ${error.message}`);
    }

    return (data as AccountRecord | null) ?? null;
  }

  private async loadAccounts(userId: string): Promise<Map<string, AccountRecord>> {
    const { data, error } = await this.databaseService
      .getClient()
      .from('accounts')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      throw new InternalServerErrorException(`Failed to load accounts: ${error.message}`);
    }

    return new Map(
      ((data ?? []) as AccountRecord[]).map((account) => [account.id, account] as const),
    );
  }

  private async setAccountRole(
    accountId: string,
    role: 'MASTER' | 'SLAVE' | 'UNASSIGNED',
  ): Promise<void> {
    const { error } = await this.databaseService
      .getClient()
      .from('accounts')
      .update({ role })
      .eq('id', accountId);

    if (error) {
      throw new InternalServerErrorException(`Failed to set account role: ${error.message}`);
    }
  }

  private startOfUtcDay(): string {
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    return dayStart.toISOString();
  }
}
