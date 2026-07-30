import { CopierLinkRecord } from '../../database/database.types';
import { MasterEvent } from '../interfaces/copier.interfaces';

export interface CopyabilityResult {
  copyable: boolean;
  reason?: string;
}

/**
 * Cheap, pure checks answering "should this link mirror this master event at
 * all?". Runs before any database work in the guard.
 */
export class CopyEventValidators {
  static isCopyable(link: CopierLinkRecord, event: MasterEvent): CopyabilityResult {
    const actionCheck = CopyEventValidators.checkAction(link, event);

    if (!actionCheck.copyable) {
      return actionCheck;
    }

    const symbolCheck = CopyEventValidators.checkSymbolFilter(link, event);

    if (!symbolCheck.copyable) {
      return symbolCheck;
    }

    return CopyEventValidators.checkFreshness(link, event);
  }

  static checkAction(link: CopierLinkRecord, event: MasterEvent): CopyabilityResult {
    if (event.action === 'CLOSE' && !link.copy_closes) {
      return { copyable: false, reason: 'Link does not copy closes' };
    }

    if (event.action === 'PARTIAL_CLOSE' && !link.copy_partial_closes) {
      return { copyable: false, reason: 'Link does not copy partial closes' };
    }

    if (event.action === 'MODIFY' && !link.copy_modifications) {
      return { copyable: false, reason: 'Link does not copy modifications' };
    }

    if (event.action === 'OPEN' && !event.side) {
      return { copyable: false, reason: 'Master OPEN event carried no side' };
    }

    if (event.action === 'OPEN' && (!event.volume || event.volume <= 0)) {
      return { copyable: false, reason: 'Master OPEN event carried no volume' };
    }

    return { copyable: true };
  }

  static checkSymbolFilter(link: CopierLinkRecord, event: MasterEvent): CopyabilityResult {
    const filter = (link.symbol_filter ?? []).map((symbol) => symbol.toUpperCase());
    const candidates = [event.symbol.toUpperCase(), event.baseSymbol.toUpperCase()];

    if (link.symbol_filter_mode === 'ALLOWLIST') {
      if (filter.length === 0 || !candidates.some((symbol) => filter.includes(symbol))) {
        return { copyable: false, reason: `${event.symbol} is not on the link allowlist` };
      }
    }

    if (link.symbol_filter_mode === 'BLOCKLIST') {
      if (candidates.some((symbol) => filter.includes(symbol))) {
        return { copyable: false, reason: `${event.symbol} is on the link blocklist` };
      }
    }

    return { copyable: true };
  }

  /** A copy that arrives too late is worse than no copy at all. */
  static checkFreshness(link: CopierLinkRecord, event: MasterEvent): CopyabilityResult {
    const maxDelayMs = Number(link.max_copy_delay_ms ?? 0);

    if (maxDelayMs <= 0) {
      return { copyable: true };
    }

    const eventTime = new Date(event.masterEventAt).getTime();

    if (!Number.isFinite(eventTime)) {
      return { copyable: true };
    }

    const delayMs = Date.now() - eventTime;

    if (delayMs > maxDelayMs) {
      return {
        copyable: false,
        reason: `Master event is ${delayMs} ms old, over the ${maxDelayMs} ms limit`,
      };
    }

    return { copyable: true };
  }

  /** Applies the link's broker naming affixes to a base symbol. */
  static applySymbolAffixes(link: CopierLinkRecord, symbol: string): string {
    return `${link.symbol_prefix ?? ''}${symbol}${link.symbol_suffix ?? ''}`;
  }
}
