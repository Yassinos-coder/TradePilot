import { useState, useEffect, useCallback, useRef, type ChangeEvent } from 'react';
import { TimeFilter, dateRangeToParams, type DateRange } from '../components/analytics/TimeFilter';
import { ExportButton } from '../components/analytics/ExportButton';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, type Variants } from 'framer-motion';
import { usePagination } from '../hooks/usePagination';
import { Pagination } from '../components/ui/Pagination';
import {
  AlertTriangle,
  BarChart3,
  FileText,
  Gauge,
  RefreshCw,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
  UploadCloud,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import type { DirectionBreakdownDTO, PeriodBreakdownDTO, TradeTypeBreakdownDTO } from '@tradepilot/shared';

import { apiClient } from '../lib/api';
import {
  cn,
  formatCurrency,
  formatDuration,
  formatPercent,
  formatTimestamp,
} from '../lib/utils';
import { Badge, type BadgeTone } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';
import { Skeleton } from '../components/ui/Skeleton';

type Tone = 'positive' | 'danger' | 'warning' | 'neutral' | 'info';

const ICON_TONE: Record<Tone, string> = {
  positive: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
  danger: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300',
  warning: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
  info: 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300',
  neutral: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};

function formatNumber(value: number | null | undefined, digits = 2) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 'Not Available';
  }

  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  }).format(value);
}

function formatRatio(value: number | null | undefined, digits = 2) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 'Not Available';
  }

  return `${value.toFixed(digits)}x`;
}

function formatRelativeTime(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function displayTradeSide(trade: {
  type: 'BUY' | 'SELL';
  openingOrderType?: 'BUY' | 'SELL' | null;
  positionDirection?: 'LONG' | 'SHORT' | null;
}) {
  if (trade.openingOrderType) {
    return trade.openingOrderType;
  }

  if (trade.positionDirection) {
    return trade.positionDirection === 'LONG' ? 'BUY' : 'SELL';
  }

  return trade.type;
}

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } },
};

const staggerContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07 } },
};

function StatCard({
  label,
  value,
  sub,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: Tone;
  icon: LucideIcon;
}) {
  return (
    <div className="rounded-3xl border border-slate-200/80 bg-white/88 p-5 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/88">
      <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
        {label}
      </span>
      <div className="mt-4 flex items-center gap-3">
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl',
            ICON_TONE[tone],
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xl font-semibold text-slate-950 dark:text-slate-100">{value}</p>
          {sub && <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-500">{sub}</p>}
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">
      {children}
    </p>
  );
}

function MetricMatrixCard({
  title,
  eyebrow,
  description,
  items,
}: {
  title: string;
  eyebrow: string;
  description: string;
  items: Array<{ label: string; value: string }>;
}) {
  return (
    <Card title={title} eyebrow={eyebrow} description={description}>
      <div className="grid gap-3 md:grid-cols-2">
        {items.map((item) => (
          <div
            key={item.label}
            className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/60"
          >
            <p className="text-sm text-slate-600 dark:text-slate-300">{item.label}</p>
            <p className="text-sm font-semibold text-slate-950 dark:text-slate-100">{item.value}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function DirectionPanel({ label, data }: { label: string; data: DirectionBreakdownDTO }) {
  const isPositive = data.netProfit >= 0;
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/60">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <p
        className={cn(
          'mt-3 text-2xl font-semibold',
          isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
        )}
      >
        {formatCurrency(data.netProfit)}
      </p>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-base font-semibold text-slate-950 dark:text-slate-100">{data.trades}</p>
          <p className="text-xs text-slate-500 dark:text-slate-500">Trades</p>
        </div>
        <div>
          <p className="text-base font-semibold text-slate-950 dark:text-slate-100">
            {formatPercent(data.winRate)}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-500">Win rate</p>
        </div>
        <div>
          <p className="text-base font-semibold text-slate-950 dark:text-slate-100">
            {data.wins}/{data.losses}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-500">W/L</p>
        </div>
      </div>
    </div>
  );
}

function EquitySparkline({
  points,
}: {
  points: Array<{ index: number; cumulativePnL: number }>;
}) {
  const recent = points.slice(-180);
  if (recent.length < 2) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
        Not enough points to render the equity curve.
      </div>
    );
  }

  const width = 900;
  const height = 220;
  const padding = 16;
  const minY = Math.min(...recent.map((point) => point.cumulativePnL));
  const maxY = Math.max(...recent.map((point) => point.cumulativePnL));
  const yRange = maxY - minY || 1;
  const xStep = (width - padding * 2) / (recent.length - 1);

  const polyline = recent
    .map((point, idx) => {
      const x = padding + idx * xStep;
      const y = padding + ((maxY - point.cumulativePnL) / yRange) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(' ');

  const firstPoint = recent[0];
  const lastPoint = recent[recent.length - 1];
  if (!firstPoint || !lastPoint) {
    return null;
  }
  const first = firstPoint.cumulativePnL;
  const last = lastPoint.cumulativePnL;
  const gain = last - first;

  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/60">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-44 w-full">
        <polyline
          fill="none"
          stroke={gain >= 0 ? '#16a34a' : '#dc2626'}
          strokeWidth={3}
          points={polyline}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>Start {formatCurrency(first)}</span>
        <span>End {formatCurrency(last)}</span>
      </div>
    </div>
  );
}

function PeriodBreakdownCard({
  title,
  eyebrow,
  description,
  rows,
  firstColumnLabel,
}: {
  title: string;
  eyebrow: string;
  description: string;
  rows: PeriodBreakdownDTO[];
  firstColumnLabel: string;
}) {
  return (
    <Card title={title} eyebrow={eyebrow} description={description}>
      <div className="-mx-5 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-100 text-xs uppercase tracking-[0.22em] text-slate-400 dark:border-slate-800 dark:text-slate-500">
            <tr>
              <th className="px-5 py-3 font-semibold">{firstColumnLabel}</th>
              <th className="px-5 py-3 font-semibold">Trades</th>
              <th className="px-5 py-3 font-semibold">Win Rate</th>
              <th className="px-5 py-3 font-semibold">W / L</th>
              <th className="px-5 py-3 font-semibold">Net Profit</th>
              <th className="px-5 py-3 font-semibold">Avg Trade</th>
              <th className="px-5 py-3 font-semibold">Avg Win</th>
              <th className="px-5 py-3 font-semibold">Avg Loss</th>
              <th className="px-5 py-3 font-semibold">Profit Factor</th>
              <th className="px-5 py-3 font-semibold">Expectancy</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.key}
                className="border-b border-slate-100 last:border-b-0 dark:border-slate-800"
              >
                <td className="px-5 py-3 font-semibold text-slate-950 dark:text-slate-100">
                  {row.label}
                </td>
                <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{row.trades}</td>
                <td className="px-5 py-3">
                  <Badge tone={(row.winRate >= 50 ? 'positive' : 'warning') as BadgeTone}>
                    {formatPercent(row.winRate)}
                  </Badge>
                </td>
                <td className="px-5 py-3 text-slate-600 dark:text-slate-300">
                  {row.wins} / {row.losses}
                </td>
                <td className="px-5 py-3">
                  <span
                    className={
                      row.netProfit >= 0
                        ? 'font-semibold text-emerald-600 dark:text-emerald-400'
                        : 'font-semibold text-red-600 dark:text-red-400'
                    }
                  >
                    {formatCurrency(row.netProfit)}
                  </span>
                </td>
                <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{formatCurrency(row.averageTrade)}</td>
                <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{formatCurrency(row.averageWin)}</td>
                <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{formatCurrency(row.averageLoss)}</td>
                <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{formatNumber(row.profitFactor, 2)}</td>
                <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{formatCurrency(row.expectancy)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function TradeTypeBreakdownCard({ rows }: { rows: TradeTypeBreakdownDTO[] }) {
  return (
    <Card
      title="Trade Type Breakdown"
      eyebrow="Market / Limit / Stop"
      description="Grouped by parsed signal entry type where available."
    >
      <div className="-mx-5 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-100 text-xs uppercase tracking-[0.22em] text-slate-400 dark:border-slate-800 dark:text-slate-500">
            <tr>
              <th className="px-5 py-3 font-semibold">Trade Type</th>
              <th className="px-5 py-3 font-semibold">Trades</th>
              <th className="px-5 py-3 font-semibold">Win Rate</th>
              <th className="px-5 py-3 font-semibold">W / L</th>
              <th className="px-5 py-3 font-semibold">Net Profit</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.tradeType}
                className="border-b border-slate-100 last:border-b-0 dark:border-slate-800"
              >
                <td className="px-5 py-3 font-semibold text-slate-950 dark:text-slate-100">
                  {row.tradeType}
                </td>
                <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{row.trades}</td>
                <td className="px-5 py-3">
                  <Badge tone={(row.winRate >= 50 ? 'positive' : 'warning') as BadgeTone}>
                    {formatPercent(row.winRate)}
                  </Badge>
                </td>
                <td className="px-5 py-3 text-slate-600 dark:text-slate-300">
                  {row.wins} / {row.losses}
                </td>
                <td className="px-5 py-3">
                  <span
                    className={
                      row.netProfit >= 0
                        ? 'font-semibold text-emerald-600 dark:text-emerald-400'
                        : 'font-semibold text-red-600 dark:text-red-400'
                    }
                  >
                    {formatCurrency(row.netProfit)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function AnalyticsSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-28 w-full" />
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={`card-${i}`} className="h-64 w-full" />
      ))}
    </div>
  );
}

export function AnalyticsPage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('all');
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [historyUploadError, setHistoryUploadError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>('all');

  const accountId = selectedAccountId === 'all' ? undefined : selectedAccountId;
  const { startDate, endDate } = dateRangeToParams(dateRange);

  const accountsQuery = useQuery({
    queryKey: ['accounts'],
    queryFn: apiClient.accounts,
    refetchInterval: 15_000,
  });

  const historyFilesQuery = useQuery({
    queryKey: ['execution', 'history-files'],
    queryFn: apiClient.tradeHistoryFiles,
  });

  const uploadHistoryMutation = useMutation({
    mutationFn: apiClient.uploadTradeHistoryFile,
    onMutate: () => setHistoryUploadError(null),
    onSuccess: async (file) => {
      const sourceAccountId = `upload:${file.id}`;
      setSelectedAccountId(sourceAccountId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['execution', 'history-files'] }),
        queryClient.invalidateQueries({ queryKey: ['execution', 'analytics'] }),
        queryClient.invalidateQueries({ queryKey: ['execution', 'trades'] }),
      ]);
    },
    onError: (error) => {
      setHistoryUploadError(error instanceof Error ? error.message : 'Failed to upload trade history.');
    },
  });

  const deleteHistoryMutation = useMutation({
    mutationFn: apiClient.deleteTradeHistoryFile,
    onSuccess: async (_, fileId) => {
      const sourceAccountId = `upload:${fileId}`;
      if (selectedAccountId === sourceAccountId) {
        setSelectedAccountId('all');
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['execution', 'history-files'] }),
        queryClient.invalidateQueries({ queryKey: ['execution', 'analytics'] }),
        queryClient.invalidateQueries({ queryKey: ['execution', 'trades'] }),
      ]);
    },
  });

  const analyticsQuery = useQuery({
    queryKey: ['execution', 'analytics', accountId ?? 'all', dateRange],
    queryFn: () => apiClient.executionAnalytics(accountId, startDate, endDate),
    refetchInterval: 15_000,
  });

  const aiAnalysisQuery = useQuery({
    queryKey: ['execution', 'ai-analysis', accountId ?? 'all', dateRange],
    queryFn: () => apiClient.aiAnalysis(accountId, startDate, endDate),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
  const tradesQuery = useQuery({
    queryKey: ['execution', 'trades', accountId ?? 'all', dateRange],
    queryFn: () => apiClient.executionTrades(accountId, 500),
    refetchInterval: 15_000,
  });

  const isRefreshing =
    analyticsQuery.isFetching || tradesQuery.isFetching || accountsQuery.isFetching || historyFilesQuery.isFetching;

  useEffect(() => {
    if (analyticsQuery.dataUpdatedAt) {
      setLastRefreshedAt(new Date(analyticsQuery.dataUpdatedAt));
    }
  }, [analyticsQuery.dataUpdatedAt]);

  const handleRefresh = useCallback(() => {
    analyticsQuery.refetch();
    tradesQuery.refetch();
    accountsQuery.refetch();
    historyFilesQuery.refetch();
  }, [analyticsQuery, tradesQuery, accountsQuery, historyFilesQuery]);

  const handleHistoryFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) {
        return;
      }
      uploadHistoryMutation.mutate(file);
    },
    [uploadHistoryMutation],
  );

  const handleDeleteHistoryFile = useCallback(
    (fileId: string) => {
      deleteHistoryMutation.mutate(fileId);
    },
    [deleteHistoryMutation],
  );

  const a = analyticsQuery.data;
  const trades = tradesQuery.data ?? [];

  const symbolsPagination = usePagination(a?.bySymbol ?? [], 15);
  const tradesPagination = usePagination(trades, 25);

  if (accountsQuery.isLoading || historyFilesQuery.isLoading || analyticsQuery.isLoading || tradesQuery.isLoading) {
    return <AnalyticsSkeleton />;
  }

  if (!a) {
    return (
      <Card title="Analytics unavailable" eyebrow="Performance">
        <p className="text-sm text-gray-500 dark:text-slate-400">
          TradePilot could not compute account analytics yet.
        </p>
      </Card>
    );
  }
  const insufficientData = !a.dataSufficiency.sufficient;
  const advancedMetricLabel = 'Not Available';
  const formatAdvancedNumber = (value: number | null | undefined, digits = 2) =>
    insufficientData ? advancedMetricLabel : formatNumber(value, digits);
  const formatAdvancedPercent = (value: number | null | undefined, digits = 2) =>
    insufficientData ? advancedMetricLabel : formatPercent(value, digits);

  const historyFiles = historyFilesQuery.data ?? [];
  const selectedHistoryFile = accountId?.startsWith('upload:')
    ? historyFiles.find((file) => `upload:${file.id}` === accountId)
    : undefined;

  const accountOptions = [
    { label: 'All accounts', value: 'all' },
    ...(accountsQuery.data ?? [])
      .filter((acc) => acc.externalAccountId)
      .map((acc) => ({
        label: `${acc.name} (${acc.externalAccountId})`,
        value: acc.externalAccountId!,
      })),
    ...historyFiles.map((file) => ({
      label: `Imported: ${file.displayName}`,
      value: `upload:${file.id}`,
    })),
  ];

  const overviewStats = [
    {
      label: 'Net Profit',
      value: formatCurrency(a.netProfit),
      sub: `Gross ${formatCurrency(a.grossProfit)} / ${formatCurrency(-a.grossLoss)}`,
      tone: (a.netProfit >= 0 ? 'positive' : 'danger') as Tone,
      icon: a.netProfit >= 0 ? TrendingUp : TrendingDown,
    },
    {
      label: 'Profit Factor',
      value: formatNumber(a.profitFactor, 2),
      sub: `Win rate ${formatPercent(a.winRate)}`,
      tone: (a.profitFactor >= 1 ? 'positive' : 'warning') as Tone,
      icon: Gauge,
    },
    {
      label: 'Expectancy',
      value: formatCurrency(a.expectancy),
      sub: `EV/trade ${formatCurrency(a.expectedValuePerTrade)}`,
      tone: (a.expectancy >= 0 ? 'positive' : 'danger') as Tone,
      icon: Target,
    },
    {
      label: 'Max Drawdown',
      value: formatCurrency(a.maxDrawdown),
      sub: formatPercent(a.maxDrawdownPercent),
      tone: (a.maxDrawdown > 0 ? 'warning' : 'neutral') as Tone,
      icon: AlertTriangle,
    },
    {
      label: 'Sharpe Ratio',
      value: formatAdvancedNumber(a.sharpeRatio, 3),
      sub: `Sortino ${formatAdvancedNumber(a.sortinoRatio, 3)}`,
      tone: (typeof a.sharpeRatio === 'number' && a.sharpeRatio > 1 ? 'positive' : 'info') as Tone,
      icon: BarChart3,
    },
    {
      label: 'Average R',
      value: formatNumber(a.averageR, 2),
      sub: a.averageR === null ? 'Requires initial risk' : `Kelly ${formatPercent(a.kellyCriterion)}`,
      tone: (typeof a.averageR === 'number' && a.averageR >= 0 ? 'positive' : 'warning') as Tone,
      icon: Target,
    },
  ];

  const corePnlItems = [
    { label: 'Starting Balance', value: formatCurrency(a.startingBalance) },
    { label: 'Current Balance', value: formatCurrency(a.currentBalance) },
    { label: 'Current Equity', value: formatCurrency(a.currentEquity) },
    { label: 'Total Closed Profit', value: formatCurrency(a.totalClosedProfit) },
    { label: 'Floating P/L', value: formatCurrency(a.floatingPl) },
    { label: 'Deposits', value: 'Not Available — broker ledger required' },
    { label: 'Withdrawals', value: 'Not Available — broker ledger required' },
    { label: 'Net Deposits', value: 'Not Available — broker ledger required' },
    { label: 'Net Profit / Loss', value: formatCurrency(a.netProfit) },
    { label: 'Gross Profit', value: formatCurrency(a.grossProfit) },
    { label: 'Gross Loss', value: formatCurrency(-a.grossLoss) },
    { label: 'Return on Account (ROA)', value: formatPercent(a.returnOnAccount) },
    { label: 'Total Return %', value: formatPercent(a.totalReturnPercent) },
    { label: 'Account Growth %', value: formatPercent(a.accountGrowthPercent) },
    { label: 'Annualized Return', value: formatAdvancedPercent(a.annualizedReturn) },
    { label: 'CAGR', value: formatAdvancedPercent(a.cagr) },
  ];

  const winLossItems = [
    { label: 'Total Trades', value: formatNumber(a.totalTrades, 0) },
    { label: 'Winning Trades', value: formatNumber(a.winningTrades, 0) },
    { label: 'Losing Trades', value: formatNumber(a.losingTrades, 0) },
    { label: 'Win Rate', value: formatPercent(a.winRate) },
    { label: 'Loss Rate', value: formatPercent(a.lossRate) },
    { label: 'Break-even Trades', value: formatNumber(a.breakEvenTrades, 0) },
    { label: 'Break-even Rate', value: formatPercent(a.breakEvenRate) },
    { label: 'Max Consecutive Wins', value: formatNumber(a.maxConsecutiveWins, 0) },
    { label: 'Max Consecutive Losses', value: formatNumber(a.maxConsecutiveLosses, 0) },
  ];

  const streakItems = [
    { label: 'Longest Winning Streak', value: formatNumber(a.maxConsecutiveWins, 0) },
    { label: 'Longest Losing Streak', value: formatNumber(a.maxConsecutiveLosses, 0) },
    { label: 'Current Winning Streak', value: formatNumber(a.currentWinningStreak, 0) },
    { label: 'Current Losing Streak', value: formatNumber(a.currentLosingStreak, 0) },
    { label: 'Largest Winning Streak $', value: formatCurrency(a.largestWinningStreakProfit) },
    { label: 'Largest Losing Streak $', value: formatCurrency(a.largestLosingStreakLoss) },
  ];

  const tradeQualityItems = [
    { label: 'Profit Factor', value: formatNumber(a.profitFactor, 2) },
    { label: 'Average Win', value: formatCurrency(a.avgWin) },
    { label: 'Average Loss', value: formatCurrency(-a.avgLoss) },
    { label: 'Win/Loss Ratio', value: formatNumber(a.winLossRatio, 2) },
    { label: 'Expectancy', value: formatCurrency(a.expectancy) },
    { label: 'Expected Value per Trade', value: formatCurrency(a.expectedValuePerTrade) },
    { label: 'Best Trade', value: formatCurrency(a.largestWin) },
    { label: 'Worst Trade', value: formatCurrency(a.largestLoss) },
    { label: 'Average Trade', value: formatCurrency(a.averageTrade) },
  ];

  const riskAdjustedItems = [
    { label: 'Sharpe Ratio', value: formatAdvancedNumber(a.sharpeRatio, 3) },
    { label: 'Sortino Ratio', value: formatAdvancedNumber(a.sortinoRatio, 3) },
    { label: 'Calmar Ratio', value: formatAdvancedNumber(a.calmarRatio, 3) },
    { label: 'Sterling Ratio', value: formatAdvancedNumber(a.sterlingRatio, 3) },
    { label: 'Omega Ratio', value: formatNumber(a.omegaRatio, 3) },
    { label: 'Information Ratio', value: formatNumber(a.informationRatio, 3) },
    { label: 'Treynor Ratio', value: formatNumber(a.treynorRatio, 3) },
    { label: "Jensen's Alpha", value: formatNumber(a.jensensAlpha, 3) },
    { label: 'Standard Deviation of Returns', value: formatAdvancedPercent(a.standardDeviationReturns) },
    { label: 'Volatility (annualized)', value: formatAdvancedPercent(a.volatilityAnnualized) },
  ];

  const drawdownItems = [
    { label: 'Maximum Drawdown', value: formatCurrency(a.maxDrawdown) },
    { label: 'Maximum Drawdown %', value: formatPercent(a.maxDrawdownPercent) },
    { label: 'Average Drawdown', value: formatCurrency(a.averageDrawdown) },
    { label: 'Median Drawdown', value: formatCurrency(a.medianDrawdown) },
    { label: 'Drawdown Duration', value: formatDuration(a.drawdownDurationHours) },
    { label: 'Recovery Duration', value: formatDuration(a.recoveryDurationHours) },
    { label: 'Recovery Factor', value: formatNumber(a.recoveryFactor, 3) },
    { label: 'Ulcer Index', value: formatNumber(a.ulcerIndex, 3) },
    { label: 'Pain Index', value: formatNumber(a.painIndex, 3) },
  ];

  const timingItems = [
    { label: 'Average Hold Time', value: formatDuration(a.avgHoldTimeHours) },
    { label: 'Avg Win Hold Time', value: formatDuration(a.avgWinHoldTimeHours) },
    { label: 'Avg Loss Hold Time', value: formatDuration(a.avgLossHoldTimeHours) },
    { label: 'Longest Trade', value: formatDuration(a.longestTradeHours) },
    { label: 'Shortest Trade', value: formatDuration(a.shortestTradeHours) },
    { label: 'Avg Time Between Trades', value: formatDuration(a.averageTimeBetweenTradesHours) },
    { label: 'Trades per Day', value: formatNumber(a.tradesPerDay, 2) },
    { label: 'Trades per Week', value: formatNumber(a.tradesPerWeek, 2) },
    { label: 'Trades per Month', value: formatNumber(a.tradesPerMonth, 2) },
    { label: 'Best Day', value: a.bestDay ? `${a.bestDay.period} (${formatCurrency(a.bestDay.netProfit)})` : '--' },
    { label: 'Worst Day', value: a.worstDay ? `${a.worstDay.period} (${formatCurrency(a.worstDay.netProfit)})` : '--' },
    { label: 'Best Month', value: a.bestMonth ? `${a.bestMonth.period} (${formatCurrency(a.bestMonth.netProfit)})` : '--' },
    { label: 'Worst Month', value: a.worstMonth ? `${a.worstMonth.period} (${formatCurrency(a.worstMonth.netProfit)})` : '--' },
    { label: 'Time in Market', value: formatPercent(a.timeInMarketPercent) },
  ];

  const riskManagementItems = [
    { label: 'Risk/Reward Ratio', value: formatNumber(a.riskRewardRatio, 3) },
    { label: 'Risk per Trade %', value: formatPercent(a.riskPerTradePercent) },
    { label: 'Maximum Daily Loss', value: formatCurrency(a.maximumDailyLoss) },
    { label: 'Maximum Weekly Loss', value: formatCurrency(a.maximumWeeklyLoss) },
    { label: 'Maximum Monthly Loss', value: formatCurrency(a.maximumMonthlyLoss) },
    { label: 'Largest Winning Day', value: formatCurrency(a.largestWinningDay) },
    { label: 'Largest Losing Day', value: formatCurrency(a.largestLosingDay) },
    { label: 'Average Daily Return', value: formatPercent(a.averageDailyReturn) },
    { label: 'Largest Winning Trade %', value: formatPercent(a.largestWinningTradePercent) },
    { label: 'Largest Losing Trade %', value: formatPercent(a.largestLosingTradePercent) },
    { label: 'Value at Risk (95%)', value: formatPercent(a.valueAtRisk95) },
    { label: 'Conditional VaR (95%)', value: formatPercent(a.conditionalVar95) },
    { label: 'Kelly Criterion', value: formatPercent(a.kellyCriterion) },
    { label: 'Average R', value: formatNumber(a.averageR, 3) },
  ];

  const positionExposureItems = [
    { label: 'Average Position Size', value: formatNumber(a.averagePositionSize, 3) },
    { label: 'Average Leverage Used', value: formatRatio(a.averageLeverage, 3) },
    { label: 'Max Leverage Used', value: formatRatio(a.maxLeverage, 3) },
    { label: 'Margin Utilization', value: formatPercent(a.marginUtilization) },
    { label: 'Exposure %', value: formatPercent(a.exposurePercent) },
    { label: 'Top Instrument Exposure', value: formatPercent(a.topInstrumentExposure) },
    { label: 'Top Symbol Contribution', value: formatPercent(a.topSymbolContribution) },
    { label: 'Top Session Contribution', value: formatPercent(a.topSessionContribution) },
    { label: 'Top Direction Contribution', value: formatPercent(a.topDirectionContribution) },
  ];

  const costItems = [
    { label: 'Total Commission Paid', value: a.totalCommissionPaid === null ? 'Not Available — commission data unavailable' : formatCurrency(a.totalCommissionPaid) },
    { label: 'Total Swap/Rollover Fees', value: a.totalSwapRolloverFees === null ? 'Not Available — swap data unavailable' : formatCurrency(a.totalSwapRolloverFees) },
    { label: 'Avg Spread Cost per Trade', value: a.avgSpreadCostPerTrade === null ? 'Not Available — spread data unavailable' : formatCurrency(a.avgSpreadCostPerTrade) },
    { label: 'Avg Slippage', value: a.avgSlippage === null ? 'Not Available — slippage data unavailable' : formatNumber(a.avgSlippage, 4) },
    { label: 'Net Profit After Costs', value: formatCurrency(a.netProfitAfterCosts) },
  ];

  const benchmarkItems = [
    { label: 'Alpha', value: a.alpha === null ? 'Not Available — requires benchmark' : formatNumber(a.alpha, 3) },
    { label: 'Beta', value: a.beta === null ? 'Not Available — requires benchmark' : formatNumber(a.beta, 3) },
    { label: 'Correlation to Benchmark', value: a.correlationToBenchmark === null ? 'Not Available — requires benchmark' : formatNumber(a.correlationToBenchmark, 3) },
    { label: 'Tracking Error', value: a.trackingError === null ? 'Not Available — requires benchmark' : formatNumber(a.trackingError, 3) },
  ];

  const equityCurveItems = [
    { label: 'Equity High-Water Mark', value: formatCurrency(a.equityHighWaterMark) },
    { label: 'Equity Curve Slope', value: formatNumber(a.equityCurveSlope, 6) },
    { label: 'R-Squared', value: formatNumber(a.equityCurveRSquared, 6) },
    { label: 'Linearity Score', value: formatPercent(a.equityCurveLinearity) },
    { label: 'Equity Curve Points', value: formatNumber(a.equityCurve.length, 0) },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">
            Performance
          </p>
          <h1 className="mt-0.5 text-xl font-semibold text-slate-950 dark:text-slate-100">
            Analytics
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <TimeFilter value={dateRange} onChange={setDateRange} />
          {a && <ExportButton analytics={a} />}
          {lastRefreshedAt && !isRefreshing && (
            <p className="hidden text-xs text-slate-400 dark:text-slate-500 sm:block">
              Updated {formatRelativeTime(lastRefreshedAt)}
            </p>
          )}
          {isRefreshing && (
            <p className="hidden text-xs text-sky-500 dark:text-sky-400 sm:block">
              Syncing…
            </p>
          )}
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-all hover:bg-slate-50 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <motion.span
              animate={{ rotate: isRefreshing ? 360 : 0 }}
              transition={
                isRefreshing
                  ? { repeat: Infinity, duration: 0.85, ease: 'linear' }
                  : { duration: 0 }
              }
              style={{ display: 'flex' }}
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </motion.span>
            Refresh
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-600 dark:text-sky-400">AI Coach</p>
            <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-slate-100">Performance Analysis</p>
          </div>
          {aiAnalysisQuery.isFetching && (
            <span className="text-xs text-slate-400 dark:text-slate-500">Analyzing…</span>
          )}
        </div>

        {aiAnalysisQuery.isLoading ? (
          <div className="space-y-2">
            {(['w-4/5', 'w-3/4', 'w-2/3', 'w-3/5', 'w-1/2'] as const).map((w) => (
              <div key={w} className={`h-4 animate-pulse rounded bg-slate-100 dark:bg-slate-800 ${w}`} />
            ))}</div>
        ) : aiAnalysisQuery.isError ? (
          <p className="text-sm text-red-600 dark:text-red-400">
            AI analysis unavailable — {(aiAnalysisQuery.error as Error)?.message ?? 'unknown error'}.
          </p>
        ) : aiAnalysisQuery.data ? (
          <div className="space-y-2.5">
            {aiAnalysisQuery.data.split('\n').filter(Boolean).slice(0, 5).map((line, i) => (
              <p key={i} className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">{line}</p>
            ))}
          </div>
        ) : null}
      </div>

      <Card
        title="Account Selector"
        eyebrow="Analytics Scope"
        description="Switch between live MetaTrader accounts or upload an exported CSV/TXT/HTML history file for offline analytics."
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
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
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none transition-colors focus:border-sky-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
              >
                {accountOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                aria-label="Upload trade history file"
                accept=".csv,.txt,.html,.htm,text/csv,text/plain,text/html"
                onChange={handleHistoryFileChange}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadHistoryMutation.isPending}
                className="flex items-center gap-2 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm font-medium text-sky-700 transition-all hover:bg-sky-100 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300 dark:hover:bg-sky-500/20"
              >
                <UploadCloud className="h-4 w-4" />
                {uploadHistoryMutation.isPending ? 'Importing…' : 'Upload history'}
              </button>
            </div>
          </div>

          {historyUploadError ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
              {historyUploadError}
            </div>
          ) : null}

          {selectedHistoryFile ? (
            <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300">
              Showing imported {selectedHistoryFile.platform} history: {selectedHistoryFile.parsedTradeCount} parsed trades from {selectedHistoryFile.originalFilename}.
            </div>
          ) : null}

          {historyFiles.length > 0 ? (
            <div className="grid gap-2 md:grid-cols-2">
              {historyFiles.map((file) => (
                <div
                  key={file.id}
                  className="group flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/60"
                >
                  <button
                    type="button"
                    onClick={() => setSelectedAccountId(`upload:${file.id}`)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                      <FileText className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-slate-950 dark:text-slate-100">
                        {file.displayName}
                      </span>
                      <span className="block truncate text-xs text-slate-500 dark:text-slate-500">
                        {file.platform} · {file.parsedTradeCount} trades · {file.skippedRowCount} skipped
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${file.displayName}`}
                    onClick={() => handleDeleteHistoryFile(file.id)}
                    disabled={deleteHistoryMutation.isPending}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 opacity-0 transition-all hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 group-hover:opacity-100 dark:hover:bg-red-500/10 dark:hover:text-red-300"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </Card>

      <div>
        <SectionLabel>High Signal Metrics</SectionLabel>
        <motion.div
          className="grid gap-4 sm:grid-cols-2 md:grid-cols-3"
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
        >
          {overviewStats.map((stat) => (
            <motion.div key={stat.label} variants={cardVariants}>
              <StatCard {...stat} />
            </motion.div>
          ))}
        </motion.div>
      </div>

      <MetricMatrixCard
        title="Core P&L"
        eyebrow="Return Profile"
        description="Primary profitability and account-level return metrics."
        items={corePnlItems}
      />

      <MetricMatrixCard
        title="Win/Loss Statistics"
        eyebrow="Trade Outcomes"
        description="Counts, rates, and streak behavior."
        items={winLossItems}
      />

      <MetricMatrixCard
        title="Streak Analytics"
        eyebrow="Momentum"
        description="Current and historical win/loss streaks by count and dollars."
        items={streakItems}
      />

      <MetricMatrixCard
        title="Trade Quality"
        eyebrow="Per-Trade Edge"
        description="Efficiency of wins vs losses and expected edge per trade."
        items={tradeQualityItems}
      />

      <MetricMatrixCard
        title="Risk-Adjusted Returns"
        eyebrow="Performance Stability"
        description="Volatility-adjusted ratios and return dispersion."
        items={riskAdjustedItems}
      />

      <MetricMatrixCard
        title="Drawdown Analytics"
        eyebrow="Capital Protection"
        description="Depth, duration, and recovery of drawdown cycles."
        items={drawdownItems}
      />

      <MetricMatrixCard
        title="Execution & Timing"
        eyebrow="Trade Rhythm"
        description="Hold times, pacing, and peak/worst time periods."
        items={timingItems}
      />

      <MetricMatrixCard
        title="Risk Management"
        eyebrow="Sizing & Downside"
        description="Risk-reward structure, VaR, Kelly, and R-multiples."
        items={riskManagementItems}
      />

      <MetricMatrixCard
        title="Position & Exposure"
        eyebrow="Account Load"
        description="Position sizing, leverage proxies, and concentration risk."
        items={positionExposureItems}
      />

      <MetricMatrixCard
        title="Cost & Slippage"
        eyebrow="Execution Friction"
        description="Cost impact metrics from available execution records."
        items={costItems}
      />

      <MetricMatrixCard
        title="Benchmark Comparison"
        eyebrow="Relative Performance"
        description="Benchmark-relative metrics when external benchmark data exists."
        items={benchmarkItems}
      />

      <Card
        title="Direction Breakdown"
        eyebrow="Long vs Short"
        description="Performance split between buy-side and sell-side trades."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <DirectionPanel label="Long (BUY)" data={a.longTrades} />
          <DirectionPanel label="Short (SELL)" data={a.shortTrades} />
        </div>
      </Card>

      {a.bySymbol.length > 0 && (
        <Card
          title="Symbol Breakdown"
          eyebrow="By Instrument"
          description="Performance grouped by traded instrument, sorted by net profit."
        >
          <div className="-mx-5 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-100 text-xs uppercase tracking-[0.22em] text-slate-400 dark:border-slate-800 dark:text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Symbol</th>
                  <th className="px-5 py-3 font-semibold">Trades</th>
                  <th className="px-5 py-3 font-semibold">Win Rate</th>
                  <th className="px-5 py-3 font-semibold">W / L</th>
                  <th className="px-5 py-3 font-semibold">Profit Factor</th>
                  <th className="px-5 py-3 font-semibold">Avg Win</th>
                  <th className="px-5 py-3 font-semibold">Avg Loss</th>
                  <th className="px-5 py-3 font-semibold">Expectancy</th>
                  <th className="px-5 py-3 font-semibold">Net Profit</th>
                </tr>
              </thead>
              <tbody>
                {symbolsPagination.pageItems.map((row) => (
                  <tr
                    key={row.symbol}
                    className="border-b border-slate-100 last:border-b-0 dark:border-slate-800"
                  >
                    <td className="px-5 py-3 font-semibold text-slate-950 dark:text-slate-100">
                      {row.symbol}
                    </td>
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{row.trades}</td>
                    <td className="px-5 py-3">
                      <Badge tone={(row.winRate >= 50 ? 'positive' : 'warning') as BadgeTone}>
                        {formatPercent(row.winRate)}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-300">
                      {row.wins} / {row.losses}
                    </td>
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-300">
                      {formatNumber(row.profitFactor, 2)}
                    </td>
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-300">
                      {formatCurrency(row.avgWin)}
                    </td>
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-300">
                      {formatCurrency(-row.avgLoss)}
                    </td>
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-300">
                      {formatCurrency(row.expectancy)}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={
                          row.netProfit >= 0
                            ? 'font-semibold text-emerald-600 dark:text-emerald-400'
                            : 'font-semibold text-red-600 dark:text-red-400'
                        }
                      >
                        {formatCurrency(row.netProfit)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            className="px-5 pt-4"
            {...symbolsPagination}
            onPageChange={symbolsPagination.setPage}
          />
        </Card>
      )}

      <PeriodBreakdownCard
        title="Session Breakdown"
        eyebrow="London / New York / Asian"
        description="Profitability and consistency by market session."
        rows={a.bySession}
        firstColumnLabel="Session"
      />

      <PeriodBreakdownCard
        title="Day of Week Breakdown"
        eyebrow="Calendar"
        description="Profit profile by weekday."
        rows={a.byDayOfWeek}
        firstColumnLabel="Day"
      />

      <PeriodBreakdownCard
        title="Hour of Day Breakdown"
        eyebrow="Intraday"
        description="Profit profile by UTC close hour."
        rows={a.byHourOfDay}
        firstColumnLabel="Hour"
      />

      <TradeTypeBreakdownCard rows={a.byTradeType} />

      <Card
        title="Equity Curve Analysis"
        eyebrow="Trajectory"
        description="Equity path quality, slope, linearity, and high-water behavior."
      >
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            {equityCurveItems.map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/60"
              >
                <p className="text-sm text-slate-600 dark:text-slate-300">{item.label}</p>
                <p className="text-sm font-semibold text-slate-950 dark:text-slate-100">{item.value}</p>
              </div>
            ))}
          </div>
          <EquitySparkline
            points={a.equityCurve.map((point) => ({
              index: point.index,
              cumulativePnL: point.cumulativePnL,
            }))}
          />
        </div>
      </Card>

      <Card
        title="Trade History"
        eyebrow="Lifecycle"
        description={selectedHistoryFile
          ? `Closed trades parsed from ${selectedHistoryFile.originalFilename}.`
          : "Trade history mirrored from the connected EA's live MetaTrader account, including manual and automated activity."
        }
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
          <>
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
                  {tradesPagination.pageItems.map((trade) => (
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
                        {trade.symbol} {displayTradeSide(trade)}
                      </td>
                      <td className="px-5 py-4">
                        <Badge
                          tone={
                            trade.status === 'OPEN'
                              ? 'info'
                              : trade.profit >= 0
                                ? 'positive'
                                : 'danger'
                          }
                        >
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
            <Pagination
              className="px-5 pt-4"
              {...tradesPagination}
              onPageChange={tradesPagination.setPage}
            />
          </>
        )}
      </Card>

      <Card
        title="Computation Assumptions"
        eyebrow="Data Availability"
        description="Important notes about how metrics are computed from available telemetry."
      >
        <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
          {a.assumptions.map((item, idx) => (
            <li key={`${idx}-${item}`} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/60">
              {item}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
