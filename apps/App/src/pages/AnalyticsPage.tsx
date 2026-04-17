import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, TrendingDown, TrendingUp } from 'lucide-react';

import { apiClient } from '../lib/api';
import {
  formatCurrency,
  formatPercent,
  formatTimestamp,
} from '../lib/utils';
import { Badge, type BadgeTone } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';
import { Skeleton } from '../components/ui/Skeleton';

function AnalyticsSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-28 w-full" />
        ))}
      </div>
      <Skeleton className="h-96 w-full" />
    </div>
  );
}

export function AnalyticsPage() {
  const accountsQuery = useQuery({
    queryKey: ['accounts'],
    queryFn: apiClient.accounts,
    refetchInterval: 15_000,
  });
  const [selectedAccountId, setSelectedAccountId] = useState<string>('all');

  useEffect(() => {
    if (selectedAccountId !== 'all') {
      return;
    }

    const firstConnected = accountsQuery.data?.find((account) => account.externalAccountId);

    if (firstConnected?.externalAccountId) {
      setSelectedAccountId(firstConnected.externalAccountId);
    }
  }, [accountsQuery.data, selectedAccountId]);

  const accountId = selectedAccountId === 'all' ? undefined : selectedAccountId;
  const analyticsQuery = useQuery({
    queryKey: ['execution', 'analytics', accountId ?? 'all'],
    queryFn: () => apiClient.executionAnalytics(accountId),
    refetchInterval: 15_000,
  });
  const tradesQuery = useQuery({
    queryKey: ['execution', 'trades', accountId ?? 'all'],
    queryFn: () => apiClient.executionTrades(accountId),
    refetchInterval: 15_000,
  });

  if (accountsQuery.isLoading || analyticsQuery.isLoading || tradesQuery.isLoading) {
    return <AnalyticsSkeleton />;
  }

  if (!analyticsQuery.data) {
    return (
      <Card title="Analytics unavailable" eyebrow="Performance">
        <p className="text-sm text-gray-500 dark:text-slate-400">
          TradePilot could not compute account analytics yet.
        </p>
      </Card>
    );
  }

  const analytics = analyticsQuery.data;
  const trades = tradesQuery.data ?? [];
  const accountOptions = [
    { label: 'All accounts', value: 'all' },
    ...(accountsQuery.data ?? [])
      .filter((account) => account.externalAccountId)
      .map((account) => ({
        label: `${account.name} (${account.externalAccountId})`,
        value: account.externalAccountId!,
      })),
  ];

  const stats = [
    {
      label: 'Total Trades',
      value: String(analytics.totalTrades),
      sub: 'Closed trades',
      tone: 'neutral' as const,
      icon: BarChart3,
    },
    {
      label: 'Wins',
      value: String(analytics.wins),
      sub: 'Profitable closes',
      tone: 'positive' as const,
      icon: TrendingUp,
    },
    {
      label: 'Losses',
      value: String(analytics.losses),
      sub: 'Losing closes',
      tone: 'danger' as const,
      icon: TrendingDown,
    },
    {
      label: 'Win Rate',
      value: formatPercent(analytics.winRate),
      sub: `Profit factor ${analytics.profitFactor.toFixed(2)}`,
      tone: analytics.winRate >= 50 ? 'positive' : 'warning',
      icon: TrendingUp,
    },
    {
      label: 'Net Profit',
      value: formatCurrency(analytics.netProfit),
      sub: `Gross +${formatCurrency(analytics.grossProfit)} / -${formatCurrency(analytics.grossLoss)}`,
      tone: analytics.netProfit >= 0 ? 'positive' : 'danger',
      icon: analytics.netProfit >= 0 ? TrendingUp : TrendingDown,
    },
  ];

  return (
    <div className="space-y-5">
      <Card
        title="Account Selector"
        eyebrow="Analytics Scope"
        description="Switch between all accounts and a single MetaTrader account to inspect win rate, PnL, and history."
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label
            htmlFor="analytics-account"
            className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400"
          >
            Account
          </label>
          <select
            id="analytics-account"
            value={selectedAccountId}
            onChange={(event) => setSelectedAccountId(event.target.value)}
            className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none transition-colors focus:border-sky-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
          >
            {accountOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-5">
        {stats.map(({ label, value, sub, tone, icon: Icon }) => (
          <div
            key={label}
            className="rounded-3xl border border-slate-200/80 bg-white/88 p-5 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/88"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
                {label}
              </span>
              <Badge tone={tone as BadgeTone}>{label}</Badge>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">
                <Icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xl font-semibold text-slate-950 dark:text-slate-100">
                  {value}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">{sub}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Card
        title="Trade History"
        eyebrow="Lifecycle"
        description="Real trade events reported by the EA after execution, partial closes, and final exits."
      >
        {trades.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center dark:border-slate-800 dark:bg-slate-950/60">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
              No trade history yet
            </p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-500">
              Once the EA reports executed trades, they will appear here with realized PnL.
            </p>
          </div>
        ) : (
          <div className="-mx-5 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-100 text-xs uppercase tracking-[0.22em] text-slate-400 dark:border-slate-800 dark:text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Account</th>
                  <th className="px-5 py-3 font-semibold">Instrument</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Volume</th>
                  <th className="px-5 py-3 font-semibold">Entry</th>
                  <th className="px-5 py-3 font-semibold">Exit</th>
                  <th className="px-5 py-3 font-semibold">PnL</th>
                  <th className="px-5 py-3 font-semibold">Updated</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((trade) => (
                  <tr
                    key={trade.id}
                    className="border-b border-slate-100 last:border-b-0 dark:border-slate-800"
                  >
                    <td className="px-5 py-4 text-slate-600 dark:text-slate-300">
                      <div>
                        <p className="font-medium text-slate-950 dark:text-slate-100">
                          {trade.accountName ?? trade.accountId}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-500">
                          {trade.accountId}
                        </p>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-slate-600 dark:text-slate-300">
                      {trade.symbol} {trade.type}
                    </td>
                    <td className="px-5 py-4">
                      <Badge tone={trade.status === 'OPEN' ? 'info' : trade.profit >= 0 ? 'positive' : 'danger'}>
                        {trade.status}
                      </Badge>
                    </td>
                    <td className="px-5 py-4 text-slate-600 dark:text-slate-300">
                      {trade.volume.toFixed(2)}
                    </td>
                    <td className="px-5 py-4 text-slate-600 dark:text-slate-300">
                      {trade.entryPrice.toFixed(2)}
                    </td>
                    <td className="px-5 py-4 text-slate-600 dark:text-slate-300">
                      {typeof trade.exitPrice === 'number' ? trade.exitPrice.toFixed(2) : '--'}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={
                          trade.profit >= 0
                            ? 'font-semibold text-emerald-600 dark:text-emerald-400'
                            : 'font-semibold text-red-600 dark:text-red-400'
                        }
                      >
                        {formatCurrency(trade.profit)}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-slate-500 dark:text-slate-400">
                      {formatTimestamp(trade.closedAt ?? trade.updatedAt)}
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
