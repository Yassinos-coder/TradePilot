import { AccountRecord } from '../../database/database.types';

/**
 * What the user calls this account.
 *
 * The EA overwrites `name` with whatever the broker reports on every reconnect,
 * so the user's own label lives in `display_name` and wins wherever an account
 * is shown.
 */
export function accountLabel(account: Pick<AccountRecord, 'name' | 'display_name'> | null | undefined): string | null {
  if (!account) {
    return null;
  }

  const preferred = account.display_name?.trim();
  return preferred && preferred.length > 0 ? preferred : account.name;
}
