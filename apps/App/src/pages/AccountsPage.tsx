import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Check, ChevronDown, Crown, Pencil, RefreshCw, X } from 'lucide-react';

import type { AccountDTO, AccountStatusDTO } from '@tradepilot/shared';

import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { accountLabel } from '@/lib/account-label';
import { apiClient } from '@/lib/api';
import { queryClient } from '@/lib/query-client';
import { cn, formatCurrency, formatLatency, formatPercent, formatTimestamp } from '@/lib/utils';
import { useToastStore } from '@/store/toast-store';

const ROLE_TONES: Record<AccountDTO['role'], BadgeTone> = {
  MASTER: 'brand',
  SLAVE: 'info',
  UNASSIGNED: 'neutral',
};

/**
 * The EA reports every 10 seconds whether anything moved, so the raw feed is
 * mostly identical rows. Keep only the snapshots where something actually
 * changed — that is the part worth reading.
 */
function keepChangesOnly(history: AccountStatusDTO[]): AccountStatusDTO[] {
  return history.filter((snapshot, index) => {
    const previous = history[index + 1];

    if (!previous) {
      return true;
    }

    return (
      snapshot.balance !== previous.balance ||
      snapshot.equity !== previous.equity ||
      snapshot.margin !== previous.margin ||
      snapshot.freeMargin !== previous.freeMargin ||
      snapshot.drawdownPercent !== previous.drawdownPercent ||
      snapshot.openPositions !== previous.openPositions
    );
  });
}

function AccountsSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-20 w-full" />
    </div>
  );
}

export function AccountsPage() {
  const pushToast = useToastStore((state) => state.push);
  const [selectedAccountId, setSelectedAccountId] = useState<string | undefined>();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);

  const accountsQuery = useQuery({
    queryKey: ['accounts'],
    queryFn: apiClient.accounts,
    refetchInterval: 30_000,
  });

  const accounts = accountsQuery.data ?? [];

  useEffect(() => {
    if (!selectedAccountId && accounts[0]) {
      setSelectedAccountId(accounts[0].id);
    }
  }, [accounts, selectedAccountId]);

  const selectedAccount = accounts.find((account) => account.id === selectedAccountId);
  const selectedExternalId = selectedAccount?.externalAccountId;

  const historyQuery = useQuery({
    queryKey: ['accounts', 'status-history', selectedExternalId ?? 'none'],
    queryFn: () => apiClient.accountStatusHistory(selectedExternalId ?? undefined, 200),
    enabled: Boolean(selectedExternalId) && historyOpen,
  });

  const changes = useMemo(() => keepChangesOnly(historyQuery.data ?? []), [historyQuery.data]);

  const renameMutation = useMutation({
    mutationFn: ({ id, displayName }: { id: string; displayName: string | null }) =>
      apiClient.renameAccount(id, displayName),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['accounts'] });
      setRenamingId(null);
      pushToast({ tone: 'success', title: 'Account renamed' });
    },
    onError: () => pushToast({ tone: 'error', title: 'Could not rename the account' }),
  });

  const promoteMutation = useMutation({
    mutationFn: (accountId: string) => apiClient.promoteToMaster(accountId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['accounts'] }),
        queryClient.invalidateQueries({ queryKey: ['copier'] }),
      ]);
      pushToast({ tone: 'success', title: 'Master account updated' });
    },
    onError: () => pushToast({ tone: 'error', title: 'Could not set the master account' }),
  });

  if (accountsQuery.isLoading) {
    return <AccountsSkeleton />;
  }

  const status = selectedAccount?.latestStatus;
  const summary: Array<{ label: string; value: string }> = [
    { label: 'Balance', value: formatCurrency(status?.balance) },
    { label: 'Equity', value: formatCurrency(status?.equity) },
    { label: 'Free margin', value: formatCurrency(status?.freeMargin) },
    { label: 'Drawdown', value: formatPercent(status?.drawdownPercent) },
    { label: 'Open positions', value: String(status?.openPositions ?? 0) },
    { label: 'Latency', value: formatLatency(selectedAccount?.latencyMs) },
  ];

  const submitRename = (id: string) =>
    renameMutation.mutate({ id, displayName: renameDraft.trim() || null });

  return (
    <div className="space-y-5">
      <Card
        title="Connected accounts"
        description="Each terminal keeps its own socket, symbol list and balance feed. Give them names so you can tell them apart."
        actions={
          <Button variant="outline" size="sm" onClick={() => void accountsQuery.refetch()}>
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        }
        bodyClassName="p-0 sm:p-0"
      >
        {accounts.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-content-primary text-sm font-medium">No accounts connected yet</p>
            <p className="text-content-tertiary mt-1 text-sm">
              Start the EA on MT4 or MT5 with an EA key from Settings → API &amp; Keys.
            </p>
          </div>
        ) : (
          <ul className="divide-line-subtle divide-y">
            {accounts.map((account) => {
              const isSelected = account.id === selectedAccountId;
              const isRenaming = renamingId === account.id;

              return (
                <li
                  key={account.id}
                  className={cn(
                    'flex flex-wrap items-center gap-3 px-5 py-3.5 transition-colors',
                    isSelected ? 'bg-brand-subtle' : 'hover:bg-surface-muted',
                  )}
                >
                  {isRenaming ? (
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <Input
                        value={renameDraft}
                        onChange={(event) => setRenameDraft(event.target.value)}
                        placeholder={account.name}
                        autoFocus
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            submitRename(account.id);
                          }
                          if (event.key === 'Escape') {
                            setRenamingId(null);
                          }
                        }}
                      />
                      <button
                        type="button"
                        aria-label="Save name"
                        onClick={() => submitRename(account.id)}
                        className="text-positive hover:bg-positive-subtle cursor-pointer rounded-lg p-2"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label="Cancel rename"
                        onClick={() => setRenamingId(null)}
                        className="text-content-tertiary hover:bg-surface-muted cursor-pointer rounded-lg p-2"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setSelectedAccountId(account.id)}
                      className="min-w-0 flex-1 cursor-pointer text-left"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-content-primary text-sm font-semibold">
                          {accountLabel(account)}
                        </span>
                        <Badge
                          tone={account.online ? 'positive' : 'neutral'}
                          dot
                          pulse={account.online}
                        >
                          {account.online ? 'Online' : 'Offline'}
                        </Badge>
                        <Badge tone={ROLE_TONES[account.role]}>
                          {account.role === 'UNASSIGNED' ? 'No role' : account.role}
                        </Badge>
                      </div>
                      <p className="text-content-tertiary mt-0.5 text-xs">
                        {account.externalAccountId ?? 'Manual entry'}
                        {account.displayName ? ` · ${account.name}` : ''}
                        {account.lastSeenAt ? ` · seen ${formatTimestamp(account.lastSeenAt)}` : ''}
                      </p>
                    </button>
                  )}

                  {!isRenaming ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        aria-label="Rename account"
                        onClick={() => {
                          setRenamingId(account.id);
                          setRenameDraft(account.displayName ?? '');
                        }}
                        className="text-content-tertiary hover:bg-surface-muted hover:text-content-primary cursor-pointer rounded-lg p-2"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      {account.role !== 'MASTER' ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => promoteMutation.mutate(account.id)}
                          isLoading={promoteMutation.isPending}
                        >
                          <Crown className="h-3.5 w-3.5" />
                          Set as master
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {selectedAccount ? (
        <div className="border-line bg-surface rounded-card border p-5 shadow-card">
          <p className="text-content-tertiary mb-3 text-xs font-medium">
            {accountLabel(selectedAccount)} · latest telemetry
          </p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
            {summary.map((item) => (
              <div key={item.label}>
                <dt className="text-content-tertiary text-[11px] font-medium">{item.label}</dt>
                <dd className="text-content-primary tabular mt-0.5 text-sm font-semibold">
                  {item.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}

      {selectedAccount && selectedExternalId ? (
        <div className="border-line bg-surface rounded-card border shadow-card">
          <button
            type="button"
            onClick={() => setHistoryOpen((open) => !open)}
            className="flex w-full cursor-pointer items-center justify-between px-5 py-4 text-left"
          >
            <div>
              <p className="text-content-primary text-sm font-semibold">Status history</p>
              <p className="text-content-tertiary mt-0.5 text-xs">
                Only snapshots where something changed. The EA reports every 10 seconds.
              </p>
            </div>
            <ChevronDown
              className={cn(
                'text-content-tertiary h-4 w-4 shrink-0 transition-transform',
                historyOpen && 'rotate-180',
              )}
            />
          </button>

          {historyOpen ? (
            <div className="border-line-subtle border-t">
              {historyQuery.isLoading ? (
                <div className="space-y-2 p-5">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <Skeleton key={index} className="h-10 w-full" />
                  ))}
                </div>
              ) : changes.length === 0 ? (
                <p className="text-content-tertiary p-5 text-sm">
                  Nothing has changed on this account yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px] text-left text-sm">
                    <thead className="border-line-subtle text-content-tertiary border-b text-xs">
                      <tr>
                        <th className="px-5 py-2.5 font-medium">Reported</th>
                        <th className="px-5 py-2.5 font-medium">Balance</th>
                        <th className="px-5 py-2.5 font-medium">Equity</th>
                        <th className="px-5 py-2.5 font-medium">Free margin</th>
                        <th className="px-5 py-2.5 font-medium">Drawdown</th>
                        <th className="px-5 py-2.5 font-medium">Positions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {changes.map((snapshot) => (
                        <tr
                          key={`${snapshot.accountId}-${snapshot.reportedAt}`}
                          className="border-line-subtle border-b last:border-0"
                        >
                          <td className="text-content-tertiary px-5 py-2.5 text-xs">
                            {formatTimestamp(snapshot.reportedAt)}
                          </td>
                          <td className="text-content-secondary tabular px-5 py-2.5">
                            {formatCurrency(snapshot.balance)}
                          </td>
                          <td className="text-content-secondary tabular px-5 py-2.5">
                            {formatCurrency(snapshot.equity)}
                          </td>
                          <td className="text-content-secondary tabular px-5 py-2.5">
                            {formatCurrency(snapshot.freeMargin)}
                          </td>
                          <td className="text-content-secondary tabular px-5 py-2.5">
                            {formatPercent(snapshot.drawdownPercent)}
                          </td>
                          <td className="text-content-secondary tabular px-5 py-2.5">
                            {snapshot.openPositions}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
