import type { AccountDTO } from '@tradepilot/shared';

/**
 * What the user calls this account. The EA overwrites `name` with the broker's
 * own label on every reconnect, so the user's `displayName` wins.
 */
export function accountLabel(account: Pick<AccountDTO, 'name' | 'displayName'>): string {
  const preferred = account.displayName?.trim();
  return preferred && preferred.length > 0 ? preferred : account.name;
}
