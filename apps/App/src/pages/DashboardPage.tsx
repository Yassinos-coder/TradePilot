import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  Copy,
  DollarSign,
  Gauge,
  Key,
  LineChart,
  Radio,
  RotateCcw,
  TimerReset,
  TrendingUp,
  Wallet,
  Wifi,
  WifiOff,
} from 'lucide-react';

import { apiClient } from '../lib/api';
import {
  formatCurrency,
  formatLatency,
  formatPercent,
  formatTimestamp,
} from '../lib/utils';
import { queryClient } from '../lib/query-client';
import { useAuthStore } from '../store/auth-store';
import { useToastStore } from '../store/toast-store';
import { EaSocketDemoCard } from '../components/dashboard/EaSocketDemoCard';
import { Badge, type BadgeTone } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Skeleton } from '../components/ui/Skeleton';

const SIGNAL_STATUS_TONES = {
  DISPATCHED: 'positive',
  VALIDATED: 'info',
  PENDING: 'warning',
  PARSE_FAILED: 'danger',
  VALIDATION_FAILED: 'danger',
  EA_OFFLINE: 'warning',
  DISPATCH_TIMEOUT: 'warning',
  EXECUTION_REJECTED: 'neutral',
} as const;

const EXECUTION_STATUS_TONES = {
  RECEIVED: 'info',
  RETRYING: 'warning',
  DISPATCHED: 'positive',
  PARSE_FAILED: 'danger',
  VALIDATION_FAILED: 'danger',
  EA_OFFLINE: 'warning',
  DISPATCH_TIMEOUT: 'danger',
  EXECUTION_REJECTED: 'neutral',
  ACCOUNT_STATUS_RECEIVED: 'info',
  TRADE_OPENED: 'positive',
  TRADE_CLOSED: 'info',
  TRADE_REJECTED: 'danger',
} as const;

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="rounded-xl border border-gray-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
          >
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-4 h-8 w-24" />
            <Skeleton className="mt-3 h-3 w-28" />
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="API Key" eyebrow="EA Authentication">
          <div className="space-y-3">
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-8 w-28" />
          </div>
        </Card>
        <Card title="EA WebSocket Demo" eyebrow="Realtime">
          <Skeleton className="h-44 w-full" />
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Card key={index} title="Loading" eyebrow="Realtime">
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((__, rowIndex) => (
                <Skeleton key={rowIndex} className="h-12 w-full" />
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function signalSummary(rawMessage: string, parsedData?: {
  symbol: string;
  type: string;
  entry: string;
  entryPrice: number | null;
  takeProfits: number[];
} | null) {
  if (!parsedData) {
    return rawMessage;
  }

  const entryLabel =
    parsedData.entry === 'MARKET'
      ? 'MARKET'
      : `LIMIT @ ${parsedData.entryPrice?.toFixed(2) ?? '--'}`;

  return `${parsedData.symbol} ${parsedData.type} ${entryLabel} | ${parsedData.takeProfits.length} TP`;
}

export function DashboardPage() {
  const user = useAuthStore((state) => state.user);
  const updateUser = useAuthStore((state) => state.updateUser);
  const pushToast = useToastStore((state) => state.push);

  const overviewQuery = useQuery({
    queryKey: ['overview'],
    queryFn: apiClient.overview,
    refetchInterval: 10_000,
  });

  const rotateMutation = useMutation({
    mutationFn: apiClient.regenerateApiKey,
    onSuccess: (data) => {
      updateUser(data);
      void queryClient.invalidateQueries({ queryKey: ['profile'] });
      pushToast({
        tone: 'success',
        title: 'API key rotated',
        description: 'Reconnect any EA clients using the new key.',
      });
    },
    onError: () => {
      pushToast({
        tone: 'error',
        title: 'API key rotation failed',
        description: 'TradePilot could not issue a fresh API key.',
      });
    },
  });

  const copyApiKey = async () => {
    if (!user?.apiKey) {
      return;
    }

    try {
      await navigator.clipboard.writeText(user.apiKey);
      pushToast({
        tone: 'success',
        title: 'API key copied',
        description: 'You can paste it directly into your EA configuration.',
      });
    } catch {
      pushToast({
        tone: 'error',
        title: 'Copy failed',
        description: 'The browser blocked clipboard access.',
      });
    }
  };

  if (overviewQuery.isLoading) {
    return <DashboardSkeleton />;
  }

  if (overviewQuery.isError || !overviewQuery.data) {
    return (
      <Card
        title="Dashboard unavailable"
        eyebrow="Overview"
        description="TradePilot could not load the current execution state."
      >
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-gray-500 dark:text-slate-400">
            Retry the overview request to restore the dashboard.
          </p>
          <Button onClick={() => void overviewQuery.refetch()}>Retry</Button>
        </div>
      </Card>
    );
  }

  const overview = overviewQuery.data;
  const eaTone: BadgeTone = !overview.eaOnline
    ? 'danger'
    : (overview.eaLatencyMs ?? 0) > 500
      ? 'warning'
      : 'positive';
  const eaLabel = !overview.eaOnline
    ? 'Offline'
    : (overview.eaLatencyMs ?? 0) > 500
      ? 'Slow'
      : 'Online';

  const stats = [
    {
      label: 'EA Status',
      badgeLabel: eaLabel,
      value: eaLabel,
      sub: overview.eaLastSeenAt
        ? `Last seen ${formatTimestamp(overview.eaLastSeenAt)}`
        : 'Waiting for heartbeat',
      icon: overview.eaOnline ? Wifi : WifiOff,
      tone: eaTone,
    },
    {
      label: 'Latency',
      badgeLabel: 'Latency',
      value: overview.eaOnline ? formatLatency(overview.eaLatencyMs) : 'Offline',
      sub: overview.eaOnline ? 'Heartbeat round-trip' : 'No live EA presence detected',
      icon: TimerReset,
      tone: eaTone,
    },
    {
      label: 'Balance',
      badgeLabel: 'Account',
      value: formatCurrency(overview.accountStatus?.balance),
      sub: overview.accountStatus
        ? `Equity ${formatCurrency(overview.accountStatus.equity)}`
        : 'Awaiting EA account status',
      icon: Wallet,
      tone: overview.accountStatus ? 'info' : 'neutral',
    },
    {
      label: 'Open Positions',
      badgeLabel: 'Exposure',
      value: overview.accountStatus ? String(overview.accountStatus.openPositions) : '--',
      sub: overview.accountStatus
        ? `Margin ${formatCurrency(overview.accountStatus.margin)}`
        : 'No live position telemetry yet',
      icon: Gauge,
      tone:
        (overview.accountStatus?.drawdownPercent ?? 0) > 10
          ? 'warning'
          : 'neutral',
    },
    {
      label: 'Win Rate',
      badgeLabel: 'Analytics',
      value: formatPercent(overview.analytics.winRate),
      sub: `${overview.analytics.wins} wins / ${overview.analytics.losses} losses`,
      icon: TrendingUp,
      tone: overview.analytics.winRate >= 50 ? 'positive' : 'warning',
    },
    {
      label: 'Profit Factor',
      badgeLabel: 'P&L',
      value: overview.analytics.profitFactor.toFixed(2),
      sub: `Net ${formatCurrency(overview.analytics.netProfit)}`,
      icon: LineChart,
      tone: overview.analytics.netProfit >= 0 ? 'positive' : 'danger',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        {stats.map(({ label, badgeLabel, value, sub, icon: Icon, tone }) => (
          <div
            key={label}
            className="rounded-xl border border-gray-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500 dark:text-slate-400">
                {label}
              </span>
              <Badge tone={tone as BadgeTone}>{badgeLabel}</Badge>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 dark:bg-slate-800">
                <Icon className="h-4 w-4 text-gray-500 dark:text-slate-300" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-xl font-semibold text-gray-900 dark:text-white">
                  {value}
                </p>
                <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">{sub}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="API Key"
          eyebrow="EA Authentication"
          description="Use this key to authenticate MetaTrader EAs over the WebSocket gateway."
        >
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800">
              <Key className="h-3.5 w-3.5 shrink-0 text-gray-400 dark:text-slate-500" />
              <code className="flex-1 truncate text-xs font-mono text-gray-700 dark:text-slate-300">
                {user?.apiKey ?? 'No API key available'}
              </code>
              <button
                type="button"
                onClick={() => void copyApiKey()}
                className="shrink-0 text-gray-400 transition-colors hover:text-blue-600 dark:text-slate-500 dark:hover:text-blue-400"
                aria-label="Copy API key"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => rotateMutation.mutate()}
              isLoading={rotateMutation.isPending}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Rotate key
            </Button>
          </div>
        </Card>

        <EaSocketDemoCard apiKey={user?.apiKey} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card title="Recent Signals" eyebrow="Signal Pipeline">
          <div className="divide-y divide-gray-100 dark:divide-slate-800">
            {overview.recentSignals.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400 dark:text-slate-500">
                No signals yet. Queue one from the Telegram screen to test the pipeline.
              </p>
            ) : (
              overview.recentSignals.map((signal) => (
                <div
                  key={signal.id}
                  className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="truncate text-sm font-medium text-gray-900 dark:text-slate-100">
                      {signalSummary(signal.rawMessage, signal.parsedData)}
                    </p>
                    <p className="truncate text-xs text-gray-500 dark:text-slate-500">
                      {signal.sourceChannel ?? 'Manual ingest'} | {formatTimestamp(signal.createdAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {typeof signal.confidence === 'number' ? (
                      <Badge tone="info">{Math.round(signal.confidence * 100)}%</Badge>
                    ) : null}
                    <Badge
                      tone={
                        SIGNAL_STATUS_TONES[
                          signal.status as keyof typeof SIGNAL_STATUS_TONES
                        ] ?? 'neutral'
                      }
                      dot
                    >
                      {signal.status}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card title="Recent Trades" eyebrow="EA Activity">
          <div className="divide-y divide-gray-100 dark:divide-slate-800">
            {overview.recentTrades.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400 dark:text-slate-500">
                No trade events have been reported by the EA yet.
              </p>
            ) : (
              overview.recentTrades.map((trade) => (
                <div
                  key={trade.id}
                  className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="truncate text-sm font-medium text-gray-900 dark:text-slate-100">
                      {trade.symbol} {trade.type} | ticket {trade.ticket}
                    </p>
                    <p className="truncate text-xs text-gray-500 dark:text-slate-500">
                      {trade.status} | {formatTimestamp(trade.updatedAt)}
                    </p>
                  </div>
                  <Badge tone={trade.profit >= 0 ? 'positive' : 'danger'}>
                    {formatCurrency(trade.profit)}
                  </Badge>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card title="Execution Logs" eyebrow="Dispatch History">
          <div className="divide-y divide-gray-100 dark:divide-slate-800">
            {overview.recentExecutionLogs.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400 dark:text-slate-500">
                No execution logs yet.
              </p>
            ) : (
              overview.recentExecutionLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="truncate text-sm text-gray-700 dark:text-slate-300">
                      {log.message}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-slate-500">
                      Attempt {log.attempt} | {formatTimestamp(log.createdAt)}
                    </p>
                  </div>
                  <Badge
                    tone={
                      EXECUTION_STATUS_TONES[
                        log.status as keyof typeof EXECUTION_STATUS_TONES
                      ] ?? 'neutral'
                    }
                  >
                    {log.status}
                  </Badge>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {!overview.eaOnline ? (
        <Card
          title="Execution Safety Notice"
          eyebrow="Guardrail"
          description="Signals remain stored even when no EA is online."
        >
          <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              TradePilot will keep parsing and validating signals, but live dispatch is paused
              until an authenticated EA reconnects.
            </p>
          </div>
        </Card>
      ) : null}

      {overview.accountStatus ? (
        <Card
          title="Account Monitoring"
          eyebrow="Live Telemetry"
          description={`Latest report ${formatTimestamp(overview.accountStatus.reportedAt)}`}
        >
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-slate-800 dark:bg-slate-950/60">
              <p className="text-xs uppercase tracking-wide text-gray-400 dark:text-slate-500">
                Balance
              </p>
              <p className="mt-2 text-lg font-semibold text-gray-900 dark:text-slate-100">
                {formatCurrency(overview.accountStatus.balance)}
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-slate-800 dark:bg-slate-950/60">
              <p className="text-xs uppercase tracking-wide text-gray-400 dark:text-slate-500">
                Equity
              </p>
              <p className="mt-2 text-lg font-semibold text-gray-900 dark:text-slate-100">
                {formatCurrency(overview.accountStatus.equity)}
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-slate-800 dark:bg-slate-950/60">
              <p className="text-xs uppercase tracking-wide text-gray-400 dark:text-slate-500">
                Free Margin
              </p>
              <p className="mt-2 text-lg font-semibold text-gray-900 dark:text-slate-100">
                {formatCurrency(overview.accountStatus.freeMargin)}
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-slate-800 dark:bg-slate-950/60">
              <p className="text-xs uppercase tracking-wide text-gray-400 dark:text-slate-500">
                Drawdown
              </p>
              <p className="mt-2 text-lg font-semibold text-gray-900 dark:text-slate-100">
                {formatPercent(overview.accountStatus.drawdownPercent)}
              </p>
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
