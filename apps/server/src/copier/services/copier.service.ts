import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { EA_DISPATCH_CHANNEL, SLAVE_ONLINE_WINDOW_MS } from '@tradepilot/config';
import { CopyOrderStatus } from '@tradepilot/shared';
import {
  buildCloseCommand,
  buildModifyCommand,
  buildOpenCommand,
  buildPartialCloseCommand,
  invertSide,
  resolveBrokerSymbol,
} from '@tradepilot/trading';

import { accountLabel } from '../../common/mappers/account-label';
import { DatabaseService } from '../../database/database.service';
import {
  AccountRecord,
  AccountStatusSnapshotRecord,
  CopierLinkRecord,
  CopyEventRecord,
  UserSymbolRecord,
} from '../../database/database.types';
import { DispatchAccountCommand, DispatchEventMessage } from '../../ea/interfaces/ea.interfaces';
import { DispatchIntentService } from '../../ea/services/dispatch-intent.service';
import { EaPresenceService } from '../../ea/services/ea-presence.service';
import { RedisService } from '../../redis/redis.service';
import { SettingsService } from '../../settings/settings.service';
import { MasterEvent } from '../interfaces/copier.interfaces';
import { CopierLinkRepository } from '../repositories/copier-link.repository';
import { CopyEventRepository } from '../repositories/copy-event.repository';
import { CopyOrderRepository } from '../repositories/copy-order.repository';
import { CopyEventValidators } from '../validators/copy-event.validators';

import { CopierGuardService, SlaveRiskSnapshot } from './copier-guard.service';
import { CopySizingService } from './copy-sizing.service';

interface PlannedCopy {
  link: CopierLinkRecord;
  slaveAccount: AccountRecord;
  command: DispatchAccountCommand;
  executionKey: string;
  requestedVolume: number | null;
  resolvedSymbol: string;
  note: string | null;
}

@Injectable()
export class CopierService {
  private readonly logger = new Logger(CopierService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly copierLinkRepository: CopierLinkRepository,
    private readonly copyEventRepository: CopyEventRepository,
    private readonly copyOrderRepository: CopyOrderRepository,
    private readonly copierGuardService: CopierGuardService,
    private readonly presenceService: EaPresenceService,
    private readonly dispatchIntentService: DispatchIntentService,
    private readonly redisService: RedisService,
    private readonly settingsService: SettingsService,
  ) {}

  /**
   * Entry point from the EA gateway when a MASTER account reports a trade event.
   * Records the event once, then fans it out to every enabled link.
   */
  async onMasterTradeEvent(event: MasterEvent): Promise<void> {
    const settings = await this.settingsService.getSettings(event.userId);

    if (!settings.autoCopyEnabled || settings.executionPaused) {
      this.logger.log(
        `Copy skipped for user ${event.userId}: copier is ${settings.executionPaused ? 'paused' : 'disabled'}`,
      );
      return;
    }

    if (settings.excludedSymbols.includes(event.baseSymbol)) {
      this.logger.log(`Copy skipped: ${event.baseSymbol} is globally excluded`);
      return;
    }

    const copyEvent = await this.copyEventRepository.insertIfNew(event);

    if (!copyEvent) {
      // The master EA resent a transaction we already fanned out.
      return;
    }

    const links = await this.copierLinkRepository.listEnabledByMaster(event.masterAccountId);

    if (links.length === 0) {
      return;
    }

    const slaveAccounts = await this.loadAccountsById(
      links.map((link) => link.slave_account_id),
    );
    const onlineAccountIds = await this.presenceService.listOnlineAccountIds(event.userId);
    const masterEquity = await this.loadLatestEquity(
      event.userId,
      event.masterExternalAccountId,
    );

    const planned: PlannedCopy[] = [];

    for (const link of links) {
      const slaveAccount = slaveAccounts.get(link.slave_account_id);

      if (!slaveAccount?.external_account_id) {
        await this.recordSkip(copyEvent, link, event, 'Slave account has no connected terminal');
        continue;
      }

      if (!onlineAccountIds.has(slaveAccount.external_account_id)) {
        await this.recordSkip(copyEvent, link, event, 'Slave EA is offline');
        continue;
      }

      const copyability = CopyEventValidators.isCopyable(link, event);

      if (!copyability.copyable) {
        await this.recordSkip(copyEvent, link, event, copyability.reason ?? 'Not copyable');
        continue;
      }

      const snapshot = await this.copierGuardService.loadSlaveSnapshot(
        event.userId,
        slaveAccount.external_account_id,
      );
      const guardResult = this.copierGuardService.evaluate({
        link,
        event,
        slaveAccount,
        slaveStatus: snapshot.status,
        openPositionCount: snapshot.openPositionCount,
        netProfitToday: snapshot.netProfitToday,
      });

      if (!guardResult.allowed) {
        await this.recordSkip(copyEvent, link, event, guardResult.reason ?? 'Blocked by risk gate');
        continue;
      }

      const plan = await this.planCopy(copyEvent, link, event, slaveAccount, snapshot, masterEquity);

      if (!plan) {
        continue;
      }

      planned.push(plan);
    }

    if (planned.length === 0) {
      return;
    }

    await this.persistPlannedOrders(copyEvent, planned, event);
    await this.dispatch(event.userId, copyEvent.id, planned);
  }

  /** Builds the EA command for one link, or records a skip and returns null. */
  private async planCopy(
    copyEvent: CopyEventRecord,
    link: CopierLinkRecord,
    event: MasterEvent,
    slaveAccount: AccountRecord,
    snapshot: SlaveRiskSnapshot,
    masterEquity: number | null,
  ): Promise<PlannedCopy | null> {
    const externalAccountId = slaveAccount.external_account_id as string;
    const executionKey = this.buildExecutionKey(copyEvent.id, link.id);

    const resolvedSymbol = await this.resolveSlaveSymbol(
      event.userId,
      externalAccountId,
      link,
      event.baseSymbol,
    );

    if (!resolvedSymbol) {
      await this.recordSkip(
        copyEvent,
        link,
        event,
        `Could not map ${event.baseSymbol} to a symbol on the slave broker`,
      );
      return null;
    }

    // Closes, partial closes and modifies target the mirrored position, which we
    // look up through the ticket map written when the OPEN was filled.
    if (event.action !== 'OPEN') {
      const mapped = await this.copyOrderRepository.findSlaveTicket(link.id, event.masterTicket);
      const slaveTicket = mapped?.slave_ticket ?? null;

      if (!slaveTicket) {
        await this.recordSkip(
          copyEvent,
          link,
          event,
          'No mirrored slave position is tracked for this master ticket',
        );
        return null;
      }

      const command = this.buildManagementCommand(
        event,
        link,
        resolvedSymbol,
        slaveTicket,
        copyEvent.id,
        executionKey,
      );

      return {
        link,
        slaveAccount,
        executionKey,
        requestedVolume: null,
        resolvedSymbol,
        note: null,
        command: {
          accountId: externalAccountId,
          accountName: accountLabel(slaveAccount),
          requestedSymbol: event.baseSymbol,
          resolvedSymbol,
          message: command,
        },
      };
    }

    const sizing = CopySizingService.resolveVolume({
      link,
      masterVolume: event.volume ?? 0,
      masterStopLoss: event.stopLoss,
      masterEntryPrice: event.entryPrice,
      masterEquity,
      slaveEquity: snapshot.status?.equity ?? null,
    });

    const side = link.reverse_copy ? invertSide(event.side ?? 'BUY') : (event.side ?? 'BUY');

    return {
      link,
      slaveAccount,
      executionKey,
      requestedVolume: sizing.volume,
      resolvedSymbol,
      note: sizing.note,
      command: {
        accountId: externalAccountId,
        accountName: accountLabel(slaveAccount),
        requestedSymbol: event.baseSymbol,
        resolvedSymbol,
        message: buildOpenCommand({
          symbol: resolvedSymbol,
          side,
          volume: sizing.volume,
          entryPrice: null,
          stopLoss: link.copy_stop_loss ? event.stopLoss : null,
          takeProfit: link.copy_take_profit ? event.takeProfit : null,
          copyEventId: copyEvent.id,
          executionKey,
        }),
      },
    };
  }

  private buildManagementCommand(
    event: MasterEvent,
    link: CopierLinkRecord,
    resolvedSymbol: string,
    slaveTicket: string,
    copyEventId: string,
    executionKey: string,
  ) {
    if (event.action === 'PARTIAL_CLOSE') {
      return buildPartialCloseCommand({
        symbol: resolvedSymbol,
        ticket: slaveTicket,
        percent: event.closePercent ?? 100,
        copyEventId,
        executionKey,
      });
    }

    if (event.action === 'MODIFY') {
      return buildModifyCommand({
        symbol: resolvedSymbol,
        ticket: slaveTicket,
        stopLoss: link.copy_stop_loss ? event.stopLoss : null,
        takeProfit: link.copy_take_profit ? event.takeProfit : null,
        copyEventId,
        executionKey,
      });
    }

    return buildCloseCommand({
      symbol: resolvedSymbol,
      ticket: slaveTicket,
      copyEventId,
      executionKey,
    });
  }

  /**
   * Resolves the broker's own spelling of a symbol on the slave account, then
   * applies the link's prefix/suffix override when one is configured.
   */
  private async resolveSlaveSymbol(
    userId: string,
    slaveExternalAccountId: string,
    link: CopierLinkRecord,
    baseSymbol: string,
  ): Promise<string | null> {
    if (link.symbol_prefix || link.symbol_suffix) {
      return CopyEventValidators.applySymbolAffixes(link, baseSymbol);
    }

    const { data, error } = await this.databaseService
      .getClient()
      .from('user_symbols')
      .select('symbol')
      .eq('user_id', userId)
      .eq('account_id', slaveExternalAccountId);

    if (error) {
      this.logger.warn(`Failed to load slave symbols: ${error.message}`);
      return null;
    }

    const available = ((data ?? []) as Array<Pick<UserSymbolRecord, 'symbol'>>).map(
      (row) => row.symbol,
    );

    if (available.length === 0) {
      // The EA has not reported its symbol list yet; send the base symbol and
      // let the terminal reject it rather than dropping the copy silently.
      return baseSymbol;
    }

    return resolveBrokerSymbol(baseSymbol, available).resolvedSymbol;
  }

  private async persistPlannedOrders(
    copyEvent: CopyEventRecord,
    planned: PlannedCopy[],
    event: MasterEvent,
  ): Promise<void> {
    for (const plan of planned) {
      await this.copyOrderRepository.insert({
        user_id: event.userId,
        copy_event_id: copyEvent.id,
        copier_link_id: plan.link.id,
        slave_account_id: plan.link.slave_account_id,
        master_ticket: event.masterTicket,
        requested_symbol: event.baseSymbol,
        resolved_symbol: plan.resolvedSymbol,
        side: event.side,
        requested_volume: plan.requestedVolume,
        status: 'SENT' satisfies CopyOrderStatus,
        skip_reason: plan.note,
        execution_key: plan.executionKey,
      });
    }
  }

  private async dispatch(
    userId: string,
    copyEventId: string,
    planned: PlannedCopy[],
  ): Promise<void> {
    const message: DispatchEventMessage = {
      eventId: randomUUID(),
      executionKey: planned[0]?.executionKey ?? copyEventId,
      copyEventId,
      userId,
      commands: planned.map((plan) => plan.command),
    };

    // Copies are always market orders; remembering it keeps the analytics
    // trade-type breakdown honest without a second lookup on the fill path.
    await Promise.all(
      planned.map((plan) => this.dispatchIntentService.remember(plan.executionKey, 'MARKET')),
    );

    await this.redisService.publish(EA_DISPATCH_CHANNEL, JSON.stringify(message));
    this.logger.log(
      `Dispatched copy event ${copyEventId} to ${planned.length} slave account(s)`,
    );
  }

  private async recordSkip(
    copyEvent: CopyEventRecord,
    link: CopierLinkRecord,
    event: MasterEvent,
    reason: string,
  ): Promise<void> {
    await this.copyOrderRepository.insert({
      user_id: event.userId,
      copy_event_id: copyEvent.id,
      copier_link_id: link.id,
      slave_account_id: link.slave_account_id,
      master_ticket: event.masterTicket,
      requested_symbol: event.baseSymbol,
      side: event.side,
      status: 'SKIPPED' satisfies CopyOrderStatus,
      skip_reason: reason,
    });
  }

  /**
   * Called when a slave reports a fill. Writes the slave ticket into the copy
   * order so later closes and modifies on the master can find this position.
   */
  async linkSlaveFill(executionKey: string, slaveTicket: string, volume: number): Promise<void> {
    const order = await this.copyOrderRepository.findByExecutionKey(executionKey);

    if (!order) {
      return;
    }

    await this.copyOrderRepository.updateStatus(order.id, 'FILLED', {
      slave_ticket: slaveTicket,
      filled_volume: volume,
    });
  }

  async recordCommandOutcome(
    executionKey: string,
    succeeded: boolean,
    message: string,
  ): Promise<void> {
    const order = await this.copyOrderRepository.findByExecutionKey(executionKey);

    if (!order) {
      return;
    }

    // A successful OPEN is only FILLED once the slave reports its ticket, so a
    // success here does not downgrade an already-FILLED row.
    if (succeeded) {
      if (order.status === 'FILLED') {
        return;
      }

      await this.copyOrderRepository.updateStatus(order.id, 'SENT');
      return;
    }

    await this.copyOrderRepository.updateStatus(order.id, 'REJECTED', {
      skip_reason: message,
    });
  }

  private async loadAccountsById(accountIds: string[]): Promise<Map<string, AccountRecord>> {
    if (accountIds.length === 0) {
      return new Map();
    }

    const { data, error } = await this.databaseService
      .getClient()
      .from('accounts')
      .select('*')
      .in('id', accountIds);

    if (error) {
      this.logger.warn(`Failed to load slave accounts: ${error.message}`);
      return new Map();
    }

    return new Map(
      ((data ?? []) as AccountRecord[]).map((account) => [account.id, account] as const),
    );
  }

  private async loadLatestEquity(
    userId: string,
    externalAccountId: string,
  ): Promise<number | null> {
    const { data, error } = await this.databaseService
      .getClient()
      .from('ea_account_status_snapshots')
      .select('*')
      .eq('user_id', userId)
      .eq('account_id', externalAccountId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    return (data as AccountStatusSnapshotRecord).equity;
  }

  /**
   * Deterministic and short enough for an MT4/MT5 order comment (31 chars),
   * which is how a slave fill is traced back to its copy order.
   */
  private buildExecutionKey(copyEventId: string, linkId: string): string {
    return `tp${copyEventId.replace(/-/g, '').slice(0, 14)}${linkId.replace(/-/g, '').slice(0, 8)}`;
  }

  static isSlaveOnline(lastSeenAt: string | null): boolean {
    if (!lastSeenAt) {
      return false;
    }

    return Date.now() - new Date(lastSeenAt).getTime() < SLAVE_ONLINE_WINDOW_MS;
  }
}
