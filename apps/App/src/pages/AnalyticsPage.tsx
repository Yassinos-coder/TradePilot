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
      <Card title="Closed Trades" eyebrow="History">
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-14 w-full" />
          ))}
        </div>
      </Card>
    </div>
  );
}

export function AnalyticsPage() {
  const analyticsQuery = useQuery({
    queryKey: ['execution', 'analytics'],
    queryFn: apiClient.executionAnalytics,
    refetchInterval: 15_000,
  });
  const tradesQuery = useQuery({
    queryKey: ['execution', 'trades'],
    queryFn: apiClient.executionTrades,
    refetchInterval: 15_000,
  });

  if (analyticsQuery.isLoading || tradesQuery.isLoading) {
    return <AnalyticsSkeleton />;
  }

  if (!analyticsQuery.data) {
    return (
      <Card title="Analytics unavailable" eyebrow="Performance">
        <p className="text-sm text-gray-500 dark:text-slate-400">
          TradePilot could not compute live trading metrics yet.
        </p>
      </Card>
    );
  }

  const analytics = analyticsQuery.data;
  const closedTrades = (tradesQuery.data ?? []).filter((trade) => trade.status === 'CLOSED');

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
      <div className="grid gap-4 md:grid-cols-5">
        {stats.map(({ label, value, sub, tone, icon: Icon }) => (
          <div
            key={label}
            className="rounded-xl border border-gray-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500 dark:text-slate-400">
                {label}
              </span>
              <Badge tone={tone as BadgeTone}>{label}</Badge>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 dark:bg-slate-800">
                <Icon className="h-4 w-4 text-gray-500 dark:text-slate-300" />
              </div>
              <div>
                <p className="text-xl font-semibold text-gray-900 dark:text-slate-100">
                  {value}
                </p>
                <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">{sub}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Card
        title="Closed Trades"
        eyebrow="History"
        description="Derived from real EA trade lifecycle updates and execution logs."
      >
        {closedTrades.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-10 text-center dark:border-slate-800 dark:bg-slate-950/60">
            <p className="text-sm font-medium text-gray-900 dark:text-slate-100">
              No closed trades yet
            </p>
            <p className="mt-1 text-sm text-gray-500 dark:text-slate-500">
              Once the EA reports a closed position, it will appear here with realized P&amp;L.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-slate-800">
            {closedTrades.map((trade) => (
              <div
                key={trade.id}
                className="flex items-center justify-between gap-4 py-3.5 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900 dark:text-slate-100">
                    {trade.symbol} {trade.type} | ticket {trade.ticket}
                  </p>
                  <p className="truncate text-xs text-gray-400 dark:text-slate-500">
                    Closed {trade.closedAt ? formatTimestamp(trade.closedAt) : formatTimestamp(trade.updatedAt)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Badge tone={trade.profit >= 0 ? 'positive' : 'danger'}>
                    {trade.profit >= 0 ? 'Win' : 'Loss'}
                  </Badge>
                  <span
                    className={[
                      'text-sm font-semibold',
                      trade.profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
                    ].join(' ')}
                  >
                    {formatCurrency(trade.profit)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
