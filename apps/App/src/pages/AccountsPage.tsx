import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, Gauge, RefreshCw, Wallet } from 'lucide-react';

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

export function AccountsPage() {
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

    const firstAccount = accountsQuery.data?.find((account) => account.externalAccountId);

    if (firstAccount?.externalAccountId) {
      setSelectedAccountId(firstAccount.externalAccountId);
    }
  }, [accountsQuery.data, selectedAccountId]);

  const historyQuery = useQuery({
    queryKey: ['accounts', 'status-history', selectedAccountId ?? 'none'],
    queryFn: () => apiClient.accountStatusHistory(selectedAccountId, 24),
    enabled: Boolean(selectedAccountId),
    refetchInterval: 10_000,
  });

  if (accountsQuery.isLoading) {
    return <AccountsSkeleton />;
  }

  const accounts = accountsQuery.data ?? [];
  const selectedAccount = accounts.find(
    (account) => account.externalAccountId === selectedAccountId,
  );
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
            <div className="w-full rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center dark:border-slate-800 dark:bg-slate-950/60">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                No MetaTrader accounts registered yet
              </p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-500">
                Start the EA on MT4 or MT5 and authenticate with your TradePilot API key.
              </p>
            </div>
          ) : (
            accounts.map((account) => {
              const active = account.externalAccountId === selectedAccountId;

              return (
                <button
                  key={account.id}
                  type="button"
                  onClick={() => setSelectedAccountId(account.externalAccountId ?? undefined)}
                  className={[
                    'min-w-[220px] rounded-3xl border px-4 py-4 text-left transition-colors',
                    active
                      ? 'border-sky-300 bg-sky-50 dark:border-sky-500/40 dark:bg-sky-500/10'
                      : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700',
                  ].join(' ')}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-950 dark:text-slate-100">
                      {account.name}
                    </p>
                    <Badge tone={account.online ? 'positive' : 'neutral'} dot>
                      {account.online ? 'Online' : 'Offline'}
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-500">
                    {account.externalAccountId ?? 'Manual entry'}
                  </p>
                  <div className="mt-4 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span>{formatLatency(account.latencyMs)}</span>
                    <span>{account.lastSeenAt ? formatTimestamp(account.lastSeenAt) : '--'}</span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </Card>

      {selectedAccount ? (
        <div className="grid gap-4 xl:grid-cols-3">
          <div className="rounded-3xl border border-slate-200/80 bg-white/88 p-5 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/88">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
                Balance
              </span>
              <Wallet className="h-4 w-4 text-sky-600 dark:text-sky-400" />
            </div>
            <p className="mt-4 text-2xl font-semibold text-slate-950 dark:text-slate-100">
              {formatCurrency(selectedAccount.latestStatus?.balance)}
            </p>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-500">
              Equity {formatCurrency(selectedAccount.latestStatus?.equity)}
            </p>
          </div>

          <div className="rounded-3xl border border-slate-200/80 bg-white/88 p-5 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/88">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
                Drawdown
              </span>
              <Gauge className="h-4 w-4 text-sky-600 dark:text-sky-400" />
            </div>
            <p className="mt-4 text-2xl font-semibold text-slate-950 dark:text-slate-100">
              {formatPercent(selectedAccount.latestStatus?.drawdownPercent)}
            </p>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-500">
              Open positions {selectedAccount.latestStatus?.openPositions ?? 0}
            </p>
          </div>

          <div className="rounded-3xl border border-slate-200/80 bg-white/88 p-5 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/88">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
                Connectivity
              </span>
              <Activity className="h-4 w-4 text-sky-600 dark:text-sky-400" />
            </div>
            <p className="mt-4 text-2xl font-semibold text-slate-950 dark:text-slate-100">
              {selectedAccount.online ? 'Online' : 'Offline'}
            </p>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-500">
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
        {!selectedAccountId ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center dark:border-slate-800 dark:bg-slate-950/60">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
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
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center dark:border-slate-800 dark:bg-slate-950/60">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
              No status history yet
            </p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-500">
              Keep the EA connected for a few seconds and the status feed will appear here.
            </p>
          </div>
        ) : (
          <div className="-mx-5 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-100 text-xs uppercase tracking-[0.22em] text-slate-400 dark:border-slate-800 dark:text-slate-500">
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
                    className="border-b border-slate-100 last:border-b-0 dark:border-slate-800"
                  >
                    <td className="px-5 py-4 text-slate-500 dark:text-slate-400">
                      {formatTimestamp(snapshot.reportedAt)}
                    </td>
                    <td className="px-5 py-4 text-slate-600 dark:text-slate-300">
                      {formatCurrency(snapshot.balance)}
                    </td>
                    <td className="px-5 py-4 text-slate-600 dark:text-slate-300">
                      {formatCurrency(snapshot.equity)}
                    </td>
                    <td className="px-5 py-4 text-slate-600 dark:text-slate-300">
                      {formatCurrency(snapshot.margin)}
                    </td>
                    <td className="px-5 py-4 text-slate-600 dark:text-slate-300">
                      {formatCurrency(snapshot.freeMargin)}
                    </td>
                    <td className="px-5 py-4 text-slate-600 dark:text-slate-300">
                      {formatPercent(snapshot.drawdownPercent)}
                    </td>
                    <td className="px-5 py-4 text-slate-600 dark:text-slate-300">
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
