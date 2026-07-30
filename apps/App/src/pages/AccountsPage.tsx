import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Activity, Crown, Gauge, RefreshCw, Wallet } from 'lucide-react';

import { apiClient } from '../lib/api';
import {
  formatCurrency,
  formatLatency,
  formatPercent,
  formatTimestamp,
} from '../lib/utils';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Skeleton } from '../components/ui/Skeleton';
import { queryClient } from '../lib/query-client';
import { useToastStore } from '../store/toast-store';

function AccountsSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-24 w-full" />
      <div className="grid gap-4 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-72 w-full" />
        ))}
      </div>
      <Skeleton className="h-96 w-full" />
    </div>
  );
}

const ROLE_TONES = {
  MASTER: 'brand',
  SLAVE: 'info',
  UNASSIGNED: 'neutral',
} as const;

export function AccountsPage() {
  const pushToast = useToastStore((state) => state.push);
  const accountsQuery = useQuery({
    queryKey: ['accounts'],
    queryFn: apiClient.accounts,
    refetchInterval: 10_000,
  });
  const [selectedAccountId, setSelectedAccountId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (selectedAccountId || !(accountsQuery.data ?? []).length) {
      return;
    }

    const first = accountsQuery.data?.[0];
    if (first) setSelectedAccountId(first.id);
  }, [accountsQuery.data, selectedAccountId]);

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

  const accounts = accountsQuery.data ?? [];
  const selectedAccount = accounts.find((account) => account.id === selectedAccountId);
  const selectedExternalId = selectedAccount?.externalAccountId;

  const historyQuery = useQuery({
    queryKey: ['accounts', 'status-history', selectedExternalId ?? 'none'],
    queryFn: () => apiClient.accountStatusHistory(selectedExternalId ?? undefined, 24),
    enabled: Boolean(selectedExternalId),
    refetchInterval: 10_000,
  });

  if (accountsQuery.isLoading) {
    return <AccountsSkeleton />;
  }
  const history = historyQuery.data ?? [];

  return (
    <div className="space-y-5">
      <Card
        title="Connected MetaTrader Accounts"
        eyebrow="Realtime Routing"
        description="Every account keeps its own live socket, symbol list, balance feed, and execution telemetry."
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              void accountsQuery.refetch();
              void historyQuery.refetch();
            }}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        }
      >
        <div className="flex flex-wrap gap-3">
          {accounts.length === 0 ? (
            <div className="w-full rounded-2xl border border-dashed border-line bg-surface-muted px-4 py-10 text-center">
              <p className="text-sm font-medium text-content-primary">
                No MetaTrader accounts registered yet
              </p>
              <p className="mt-1 text-sm text-content-tertiary">
                Start the EA on MT4 or MT5 and authenticate with an EA key from Settings → API &
                Keys.
              </p>
            </div>
          ) : (
            accounts.map((account) => {
              const active = account.id === selectedAccountId;

              return (
                <button
                  key={account.id}
                  type="button"
                  onClick={() => setSelectedAccountId(account.id)}
                  className={[
                    'min-w-[220px] rounded-3xl border px-4 py-4 text-left transition-colors',
                    active
                      ? 'border-brand/40 bg-brand-subtle'
                      : 'border-line bg-surface hover:border-line',
                  ].join(' ')}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-content-primary">
                      {account.name}
                    </p>
                    <Badge tone={account.online ? 'positive' : 'neutral'} dot>
                      {account.online ? 'Online' : 'Offline'}
                    </Badge>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <Badge tone={ROLE_TONES[account.role]}>
                      {account.role === 'UNASSIGNED' ? 'No role' : account.role}
                    </Badge>
                    <span className="text-xs text-content-tertiary">
                      {account.externalAccountId ?? 'Manual entry'}
                    </span>
                  </div>
                  <div className="mt-4 flex items-center justify-between text-xs text-content-tertiary">
                    <span>{formatLatency(account.latencyMs)}</span>
                    <span>{account.lastSeenAt ? formatTimestamp(account.lastSeenAt) : '--'}</span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </Card>

      {selectedAccount && selectedAccount.role !== 'MASTER' ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface p-4 shadow-card">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-content-primary">
              Make {selectedAccount.name} the master?
            </p>
            <p className="mt-0.5 text-xs leading-5 text-content-tertiary">
              Trades taken here will be mirrored to your slave accounts. The account that holds the
              role today is demoted, and any link pointing at this account is removed.
            </p>
          </div>
          <Button
            onClick={() => promoteMutation.mutate(selectedAccount.id)}
            isLoading={promoteMutation.isPending}
          >
            <Crown className="h-3.5 w-3.5" />
            Set as master
          </Button>
        </div>
      ) : null}

      {selectedAccount ? (
        <div className="grid gap-4 xl:grid-cols-3">
          <div className="rounded-3xl border border-line bg-surface p-5 shadow-sm backdrop-blur">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-[0.22em] text-content-tertiary">
                Balance
              </span>
              <Wallet className="h-4 w-4 text-brand" />
            </div>
            <p className="mt-4 text-2xl font-semibold text-content-primary">
              {formatCurrency(selectedAccount.latestStatus?.balance)}
            </p>
            <p className="mt-2 text-sm text-content-tertiary">
              Equity {formatCurrency(selectedAccount.latestStatus?.equity)}
            </p>
          </div>

          <div className="rounded-3xl border border-line bg-surface p-5 shadow-sm backdrop-blur">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-[0.22em] text-content-tertiary">
                Drawdown
              </span>
              <Gauge className="h-4 w-4 text-brand" />
            </div>
            <p className="mt-4 text-2xl font-semibold text-content-primary">
              {formatPercent(selectedAccount.latestStatus?.drawdownPercent)}
            </p>
            <p className="mt-2 text-sm text-content-tertiary">
              Open positions {selectedAccount.latestStatus?.openPositions ?? 0}
            </p>
          </div>

          <div className="rounded-3xl border border-line bg-surface p-5 shadow-sm backdrop-blur">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-[0.22em] text-content-tertiary">
                Connectivity
              </span>
              <Activity className="h-4 w-4 text-brand" />
            </div>
            <p className="mt-4 text-2xl font-semibold text-content-primary">
              {selectedAccount.online ? 'Online' : 'Offline'}
            </p>
            <p className="mt-2 text-sm text-content-tertiary">
              {selectedAccount.lastSeenAt
                ? `Last seen ${formatTimestamp(selectedAccount.lastSeenAt)}`
                : 'No heartbeat yet'}
            </p>
          </div>
        </div>
      ) : null}

      <Card
        title="Account Status History"
        eyebrow="10-second snapshots"
        description="The EA sends balance, equity, margin, free margin, drawdown, and open position counts every 10 seconds."
      >
        {!selectedAccountId || !selectedExternalId ? (
          <div className="rounded-2xl border border-dashed border-line bg-surface-muted px-4 py-10 text-center">
            <p className="text-sm font-medium text-content-primary">
              Pick an account to inspect its latest telemetry
            </p>
          </div>
        ) : historyQuery.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-14 w-full" />
            ))}
          </div>
        ) : history.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-surface-muted px-4 py-10 text-center">
            <p className="text-sm font-medium text-content-primary">
              No status history yet
            </p>
            <p className="mt-1 text-sm text-content-tertiary">
              Keep the EA connected for a few seconds and the status feed will appear here.
            </p>
          </div>
        ) : (
          <div className="-mx-5 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-line-subtle text-xs uppercase tracking-[0.22em] text-content-tertiary">
                <tr>
                  <th className="px-5 py-3 font-semibold">Reported</th>
                  <th className="px-5 py-3 font-semibold">Balance</th>
                  <th className="px-5 py-3 font-semibold">Equity</th>
                  <th className="px-5 py-3 font-semibold">Margin</th>
                  <th className="px-5 py-3 font-semibold">Free Margin</th>
                  <th className="px-5 py-3 font-semibold">Drawdown</th>
                  <th className="px-5 py-3 font-semibold">Open Positions</th>
                </tr>
              </thead>
              <tbody>
                {history.map((snapshot) => (
                  <tr
                    key={`${snapshot.accountId}-${snapshot.reportedAt}`}
                    className="border-b border-line-subtle last:border-b-0"
                  >
                    <td className="px-5 py-4 text-content-tertiary">
                      {formatTimestamp(snapshot.reportedAt)}
                    </td>
                    <td className="px-5 py-4 text-content-secondary">
                      {formatCurrency(snapshot.balance)}
                    </td>
                    <td className="px-5 py-4 text-content-secondary">
                      {formatCurrency(snapshot.equity)}
                    </td>
                    <td className="px-5 py-4 text-content-secondary">
                      {formatCurrency(snapshot.margin)}
                    </td>
                    <td className="px-5 py-4 text-content-secondary">
                      {formatCurrency(snapshot.freeMargin)}
                    </td>
                    <td className="px-5 py-4 text-content-secondary">
                      {formatPercent(snapshot.drawdownPercent)}
                    </td>
                    <td className="px-5 py-4 text-content-secondary">
                      {snapshot.openPositions}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
