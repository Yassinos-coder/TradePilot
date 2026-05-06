import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Filter,
  Key,
  MessageSquareText,
  PauseCircle,
  RefreshCw,
  RotateCcw,
  TimerReset,
  TrendingUp,
  Wallet,
  Wifi,
  WifiOff,
  Zap,
  Trash2,
} from 'lucide-react';

import type { SignalHistoryFilter, SignalRecordDTO } from '@tradepilot/shared';

import { apiClient } from '../lib/api';
import { ManualDispatchModal } from '../components/ui/ManualDispatchModal';
import {
  formatCurrency,
  formatLatency,
  formatPercent,
  formatTimestamp,
} from '../lib/utils';
import { queryClient } from '../lib/query-client';
import { useAuthStore } from '../store/auth-store';
import { useToastStore } from '../store/toast-store';
import { Badge, type BadgeTone } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Pagination } from '../components/ui/Pagination';
import { Skeleton } from '../components/ui/Skeleton';
import { usePagination } from '../hooks/usePagination';

const SIGNAL_STATUS_TONES = {
  EXECUTED: 'positive',
  DISPATCHED: 'positive',
  PARSED: 'info',
  VALIDATED: 'info',
  PENDING: 'warning',
  IGNORED: 'neutral',
  BLOCKED: 'danger',
  AUTO_COPY_DISABLED: 'warning',
  SYMBOL_UNRESOLVED: 'danger',
  PARSE_FAILED: 'danger',
  VALIDATION_FAILED: 'danger',
  EA_OFFLINE: 'warning',
  DISPATCH_TIMEOUT: 'warning',
  EXECUTION_REJECTED: 'danger',
} as const;

const EXECUTION_STATUS_TONES = {
  RECEIVED: 'info',
  RETRYING: 'warning',
  DISPATCHED: 'positive',
  PARSE_FAILED: 'danger',
  PARSING_COMPLETED: 'info',
  VALIDATION_FAILED: 'danger',
  VALIDATION_COMPLETED: 'positive',
  TELEGRAM_MESSAGE_RECEIVED: 'info',
  SYMBOL_MAPPED: 'positive',
  SYMBOL_MAPPING_FAILED: 'danger',
  EA_OFFLINE: 'warning',
  DISPATCH_TIMEOUT: 'danger',
  EXECUTION_REJECTED: 'danger',
  AUTO_COPY_DISABLED: 'warning',
  IGNORED: 'neutral',
  BLOCKED: 'danger',
  RISK_LIMIT_HIT: 'danger',
  FAILSAFE_TRIGGERED: 'danger',
  ACCOUNT_STATUS_RECEIVED: 'info',
  TRADE_OPENED: 'positive',
  TRADE_CLOSED: 'info',
  TRADE_REJECTED: 'danger',
  COMMAND_SUCCEEDED: 'positive',
  COMMAND_FAILED: 'danger',
} as const;

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-32 w-full" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Skeleton className="h-72 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-80 w-full" />
        ))}
      </div>
    </div>
  );
}

function renderSignalSummary(signal: {
  rawMessage: string;
  parsedData?: {
    action: string;
    symbol: string;
    type: string | null;
  } | null;
}) {
  if (!signal.parsedData) {
    return signal.rawMessage;
  }

  return [signal.parsedData.action, signal.parsedData.symbol, signal.parsedData.type]
    .filter(Boolean)
    .join(' ');
}

function detailText(
  details: Record<string, unknown> | null | undefined,
  key: string,
) {
  const value = details?.[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

const SIGNAL_FILTER_OPTIONS: Array<{
  label: string;
  value: SignalHistoryFilter;
}> = [
  { label: 'All', value: 'ALL' },
  { label: 'Signals', value: 'SIGNALS' },
  { label: 'Management', value: 'MANAGEMENT' },
  { label: 'Noise', value: 'NOISE' },
];

function signalStatusLabel(status: string) {
  switch (status) {
    case 'PARSED':
      return 'Parsed';
    case 'VALIDATION_FAILED':
      return 'Validation failed';
    case 'EXECUTED':
      return 'Executed';
    case 'IGNORED':
      return 'Ignored';
    case 'BLOCKED':
      return 'Blocked';
    case 'AUTO_COPY_DISABLED':
      return 'Auto-copy disabled';
    case 'SYMBOL_UNRESOLVED':
      return 'Symbol unresolved';
    default:
      return status.replace(/_/g, ' ');
  }
}

export function DashboardPage() {
  const user = useAuthStore((state) => state.user);
  const updateUser = useAuthStore((state) => state.updateUser);
  const pushToast = useToastStore((state) => state.push);
  const [dispatchSignal, setDispatchSignal] = useState<SignalRecordDTO | null>(null);
  const [signalFilter, setSignalFilter] = useState<SignalHistoryFilter>('ALL');
  const [signalFilterTouched, setSignalFilterTouched] = useState(false);
  const [selectedSignalIds, setSelectedSignalIds] = useState<string[]>([]);

  const overviewQuery = useQuery({
    queryKey: ['overview'],
    queryFn: apiClient.overview,
    refetchInterval: 10_000,
  });

  const signalHistoryQuery = useQuery({
    queryKey: ['signals', 'history', signalFilter, signalFilterTouched],
    queryFn: () =>
      apiClient.signals({
        limit: 100,
        filter: signalFilter,
        includeNoise: signalFilter === 'ALL' ? signalFilterTouched : true,
      }),
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
        description: 'Reconnect your MetaTrader terminals with the new key.',
      });
    },
    onError: () => {
      pushToast({
        tone: 'error',
        title: 'API key rotation failed',
        description: 'TradePilot could not issue a fresh key.',
      });
    },
  });

  const autoCopyMutation = useMutation({
    mutationFn: apiClient.updateAutoCopy,
    onMutate: async (enabled) => {
      await queryClient.cancelQueries({ queryKey: ['overview'] });
      const previous = queryClient.getQueryData(['overview']);
      queryClient.setQueryData(['overview'], (current: any) =>
        current
          ? {
              ...current,
              tradingEngine: {
                ...current.tradingEngine,
                autoCopyEnabled: enabled,
              },
            }
          : current,
      );
      return { previous };
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['overview'] }),
        queryClient.invalidateQueries({ queryKey: ['settings'] }),
      ]);
      pushToast({
        tone: 'success',
        title: 'Auto copy trading updated',
      });
    },
    onError: (_error, _variables, context) => {
      pushToast({
        tone: 'error',
        title: 'Auto copy toggle failed',
      });
      if (context?.previous) {
        queryClient.setQueryData(['overview'], context.previous);
      }
    },
  });

  const deleteSignalsMutation = useMutation({
    mutationFn: apiClient.softDeleteSignals,
    onSuccess: async (result) => {
      setSelectedSignalIds([]);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['signals', 'history'] }),
        queryClient.invalidateQueries({ queryKey: ['overview'] }),
      ]);
      pushToast({
        tone: 'success',
        title: 'Signal history updated',
        description: `${result.deletedCount} row(s) were removed from active history.`,
      });
    },
    onError: () => {
      pushToast({
        tone: 'error',
        title: 'Could not update signal history',
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
        description: 'Paste it into your EA settings to authenticate the terminal.',
      });
    } catch {
      pushToast({
        tone: 'error',
        title: 'Copy failed',
        description: 'The browser blocked clipboard access.',
      });
    }
  };

  const overview = overviewQuery.data;
  const signalHistory = signalHistoryQuery.data ?? [];

  const accountsPagination = usePagination(overview?.connectedAccounts ?? [], 10);
  const signalsPagination = usePagination(signalHistory, 8);
  const logsPagination = usePagination(overview?.recentExecutionLogs ?? [], 5);
  const tradesPagination = usePagination(overview?.recentTrades ?? [], 5);

  if (overviewQuery.isLoading) {
    return <DashboardSkeleton />;
  }

  if (overviewQuery.isError || !overview) {
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

  const onlineAccounts = overview.connectedAccounts.filter((account) => account.online);
  const lastTelegram = overview.lastTelegramMessage;

  const stats = [
    {
      label: 'EA Presence',
      value: overview.eaOnline ? `${onlineAccounts.length} online` : 'Offline',
      sub: overview.eaLastSeenAt
        ? `Last seen ${formatTimestamp(overview.eaLastSeenAt)}`
        : 'No account heartbeat yet',
      icon: overview.eaOnline ? Wifi : WifiOff,
      tone: (overview.eaOnline ? 'positive' : 'danger') as BadgeTone,
    },
    {
      label: 'Latency',
      value: formatLatency(overview.eaLatencyMs),
      sub: overview.eaOnline ? 'Measured from live heartbeat responses' : 'Waiting for EA pings',
      icon: TimerReset,
      tone: ((overview.eaLatencyMs ?? 0) > 500 ? 'warning' : 'info') as BadgeTone,
    },
    {
      label: 'Balance',
      value: formatCurrency(overview.accountStatus?.balance),
      sub: overview.accountStatus
        ? `Equity ${formatCurrency(overview.accountStatus.equity)}`
        : 'Awaiting account telemetry',
      icon: Wallet,
      tone: (overview.accountStatus ? 'info' : 'neutral') as BadgeTone,
    },
    {
      label: 'Win Rate',
      value: formatPercent(overview.analytics.winRate),
      sub: `${overview.analytics.wins} wins / ${overview.analytics.losses} losses`,
      icon: TrendingUp,
      tone: (overview.analytics.winRate >= 50 ? 'positive' : 'warning') as BadgeTone,
    },
  ];
  const showFailsafeAlert =
    !overview.eaOnline ||
    !overview.tradingEngine.telegramConnected ||
    overview.tradingEngine.executionPaused;

  return (
    <div className="space-y-6">
      <Card
        title="Auto Copy Trading"
        eyebrow="Master Execution Toggle"
        description="Signal ingestion and analytics continue even when automatic trade execution is disabled."
      >
        <div className="sticky top-20 z-20 rounded-2xl border border-slate-200 bg-white/95 px-4 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-950 dark:text-slate-100">
                {overview.tradingEngine.autoCopyEnabled
                  ? '🟢 Auto Copy Enabled'
                  : '🔴 Auto Copy Disabled'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {overview.tradingEngine.autoCopyEnabled
                  ? 'Validated signals can be executed on connected accounts.'
                  : 'Signals are still parsed and logged, but no execution commands are sent.'}
              </p>
            </div>
            <button
              type="button"
              disabled={autoCopyMutation.isPending}
              onClick={() =>
                autoCopyMutation.mutate(!overview.tradingEngine.autoCopyEnabled)
              }
              className={[
                'relative h-9 w-20 rounded-full transition-colors',
                overview.tradingEngine.autoCopyEnabled
                  ? 'bg-emerald-500'
                  : 'bg-red-500',
                autoCopyMutation.isPending ? 'opacity-70' : '',
              ].join(' ')}
            >
              <span
                className={[
                  'absolute top-1 h-7 w-7 rounded-full bg-white shadow transition-transform',
                  overview.tradingEngine.autoCopyEnabled ? 'left-12' : 'left-1',
                ].join(' ')}
              />
            </button>
          </div>

          {overview.tradingEngine.executionPaused ? (
            <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
              <PauseCircle className="h-3.5 w-3.5" />
              Execution paused: {overview.tradingEngine.executionPauseReason ?? 'Failsafe'}
            </div>
          ) : (
            <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Trading engine active
            </div>
          )}
        </div>
      </Card>

      <Card
        title="Trading Engine"
        eyebrow="Execution Observability"
        description="Live execution readiness and failsafe health summary."
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/60">
            <p className="text-xs text-slate-500 dark:text-slate-400">Auto-copy</p>
            <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
              {overview.tradingEngine.autoCopyEnabled ? '🟢 Enabled' : '🔴 Disabled'}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/60">
            <p className="text-xs text-slate-500 dark:text-slate-400">Connected accounts</p>
            <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
              {overview.tradingEngine.connectedAccounts}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/60">
            <p className="text-xs text-slate-500 dark:text-slate-400">Telegram status</p>
            <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
              {overview.tradingEngine.telegramConnected ? 'Connected' : 'Disconnected'}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/60">
            <p className="text-xs text-slate-500 dark:text-slate-400">Last signal</p>
            <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
              {overview.tradingEngine.lastSignalAt
                ? formatTimestamp(overview.tradingEngine.lastSignalAt)
                : '--'}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/60">
            <p className="text-xs text-slate-500 dark:text-slate-400">Last trade</p>
            <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
              {overview.tradingEngine.lastTradeAt
                ? formatTimestamp(overview.tradingEngine.lastTradeAt)
                : '--'}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/60">
            <p className="text-xs text-slate-500 dark:text-slate-400">Risk status</p>
            <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
              {overview.tradingEngine.riskStatus}
            </p>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(({ label, value, sub, icon: Icon, tone }) => (
          <div
            key={label}
            className="rounded-3xl border border-slate-200/80 bg-white/88 p-5 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/88"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                {label}
              </span>
              <Badge tone={tone}>{label}</Badge>
            </div>
            <div className="mt-5 flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">
                  {value}
                </p>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{sub}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card
          title="Connected Accounts"
          eyebrow="Multi-account EA"
          description="Live sockets, broker latency, and latest balance/equity per MetaTrader account."
          actions={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void overviewQuery.refetch()}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
          }
        >
          {overview.connectedAccounts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center dark:border-slate-800 dark:bg-slate-950/60">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                No accounts connected yet
              </p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-500">
                Authenticate at least one MT4/MT5/cTrader EA with your API key to start routing.
              </p>
            </div>
          ) : (
            <>
              <div className="-mx-5 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-slate-100 text-xs uppercase tracking-[0.22em] text-slate-400 dark:border-slate-800 dark:text-slate-500">
                    <tr>
                      <th className="px-5 py-3 font-semibold">Account</th>
                      <th className="px-5 py-3 font-semibold">Status</th>
                      <th className="px-5 py-3 font-semibold">Latency</th>
                      <th className="px-5 py-3 font-semibold">Balance</th>
                      <th className="px-5 py-3 font-semibold">Equity</th>
                      <th className="px-5 py-3 font-semibold">Last seen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accountsPagination.pageItems.map((account) => (
                      <tr
                        key={account.id}
                        className="border-b border-slate-100 last:border-b-0 dark:border-slate-800"
                      >
                        <td className="px-5 py-4">
                          <div>
                            <p className="font-medium text-slate-950 dark:text-slate-100">
                              {account.name}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-500">
                              {account.externalAccountId ?? 'Manual entry'}
                            </p>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <Badge tone={account.online ? 'positive' : 'neutral'} dot>
                            {account.online ? 'Online' : 'Offline'}
                          </Badge>
                        </td>
                        <td className="px-5 py-4 text-slate-600 dark:text-slate-300">
                          {formatLatency(account.latencyMs)}
                        </td>
                        <td className="px-5 py-4 text-slate-600 dark:text-slate-300">
                          {formatCurrency(account.latestStatus?.balance)}
                        </td>
                        <td className="px-5 py-4 text-slate-600 dark:text-slate-300">
                          {formatCurrency(account.latestStatus?.equity)}
                        </td>
                        <td className="px-5 py-4 text-slate-500 dark:text-slate-400">
                          {account.lastSeenAt ? formatTimestamp(account.lastSeenAt) : '--'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination
                className="px-1 pt-4"
                {...accountsPagination}
                onPageChange={accountsPagination.setPage}
              />
            </>
          )}
        </Card>

        <div className="space-y-4">
          <Card
            title="EA API Key"
            eyebrow="Authentication"
            description="Each MetaTrader terminal authenticates with this key during the WebSocket handshake."
          >
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-800 dark:bg-slate-950/70">
                <Key className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
                <code className="min-w-0 flex-1 truncate text-xs text-slate-700 dark:text-slate-300">
                  {user?.apiKey ?? 'No API key available'}
                </code>
                <button
                  type="button"
                  aria-label="Copy API key"
                  onClick={() => void copyApiKey()}
                  className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-sky-600 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-sky-400"
                >
                  <Copy className="h-4 w-4" />
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

          <Card
            title="Last Telegram Message"
            eyebrow="Ingestion"
            description="Every Telegram message is logged before parsing, then replay-safe backfill checks repair any gaps."
          >
            {lastTelegram ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <MessageSquareText className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                  <p className="text-sm font-medium text-slate-950 dark:text-slate-100">
                    {renderSignalSummary(lastTelegram)}
                  </p>
                </div>
                <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                  {lastTelegram.rawMessage}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Badge tone="info">{lastTelegram.telegramChannelId ?? 'Manual'}</Badge>
                  {lastTelegram.telegramMessageId ? (
                    <Badge tone="neutral">Msg {lastTelegram.telegramMessageId}</Badge>
                  ) : null}
                  <Badge
                    tone={
                      SIGNAL_STATUS_TONES[
                        lastTelegram.status as keyof typeof SIGNAL_STATUS_TONES
                      ] ?? 'neutral'
                    }
                  >
                    {lastTelegram.status}
                  </Badge>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center dark:border-slate-800 dark:bg-slate-950/60">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  No Telegram traffic yet
                </p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-500">
                  Connect Telegram and enable at least one channel to begin ingestion.
                </p>
              </div>
            )}
          </Card>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card
          title="Signal History"
          eyebrow="Classification + Status"
          actions={
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSignalFilter('ALL');
                  setSignalFilterTouched(false);
                }}
              >
                <Filter className="h-3.5 w-3.5" />
                Reset
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => deleteSignalsMutation.mutate({ clearAll: true })}
                isLoading={deleteSignalsMutation.isPending}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear all
              </Button>
            </div>
          }
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <label className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
              Filter
            </label>
            <select
              value={signalFilter}
              onChange={(event) => {
                setSignalFilter(event.target.value as SignalHistoryFilter);
                setSignalFilterTouched(true);
                setSelectedSignalIds([]);
              }}
              className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
            >
              {SIGNAL_FILTER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {signalHistoryQuery.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-14 w-full" />
              ))}
            </div>
          ) : signalHistory.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-500">
              No signals in this filter.
            </p>
          ) : (
            <>
              <div className="-mx-5 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-slate-100 text-xs uppercase tracking-[0.22em] text-slate-400 dark:border-slate-800 dark:text-slate-500">
                    <tr>
                      <th className="px-5 py-3">
                        <input
                          type="checkbox"
                          checked={
                            signalsPagination.pageItems.length > 0 &&
                            signalsPagination.pageItems.every((item) =>
                              selectedSignalIds.includes(item.id),
                            )
                          }
                          onChange={(event) => {
                            if (event.target.checked) {
                              setSelectedSignalIds((previous) =>
                                Array.from(
                                  new Set([
                                    ...previous,
                                    ...signalsPagination.pageItems.map((item) => item.id),
                                  ]),
                                ),
                              );
                            } else {
                              setSelectedSignalIds((previous) =>
                                previous.filter(
                                  (id) =>
                                    !signalsPagination.pageItems
                                      .map((item) => item.id)
                                      .includes(id),
                                ),
                              );
                            }
                          }}
                        />
                      </th>
                      <th className="px-5 py-3 font-semibold">Message</th>
                      <th className="px-5 py-3 font-semibold">Class</th>
                      <th className="px-5 py-3 font-semibold">Status</th>
                      <th className="px-5 py-3 font-semibold">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {signalsPagination.pageItems.map((signal) => (
                      <tr
                        key={signal.id}
                        className="border-b border-slate-100 last:border-b-0 dark:border-slate-800"
                      >
                        <td className="px-5 py-3">
                          <input
                            type="checkbox"
                            checked={selectedSignalIds.includes(signal.id)}
                            onChange={(event) =>
                              setSelectedSignalIds((previous) =>
                                event.target.checked
                                  ? Array.from(new Set([...previous, signal.id]))
                                  : previous.filter((id) => id !== signal.id),
                              )
                            }
                          />
                        </td>
                        <td className="px-5 py-3">
                          <p className="font-medium text-slate-900 dark:text-slate-100">
                            {renderSignalSummary(signal)}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-500">
                            {formatTimestamp(signal.createdAt)}
                          </p>
                        </td>
                        <td className="px-5 py-3">
                          <Badge tone={signal.classification === 'NOISE' ? 'warning' : 'info'}>
                            {signal.classification}
                          </Badge>
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            {(
                              ['VALIDATED', 'EA_OFFLINE', 'DISPATCH_TIMEOUT', 'BLOCKED'] as const
                            ).includes(
                              signal.status as 'VALIDATED' | 'EA_OFFLINE' | 'DISPATCH_TIMEOUT' | 'BLOCKED',
                            ) ? (
                              <button
                                type="button"
                                aria-label="Execute manually"
                                title="Execute manually"
                                onClick={() => setDispatchSignal(signal)}
                                className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-sky-50 hover:text-sky-600 dark:hover:bg-sky-500/10 dark:hover:text-sky-400"
                              >
                                <Zap className="h-3.5 w-3.5" />
                              </button>
                            ) : null}
                            <Badge
                              tone={
                                SIGNAL_STATUS_TONES[
                                  signal.status as keyof typeof SIGNAL_STATUS_TONES
                                ] ?? 'neutral'
                              }
                            >
                              {signalStatusLabel(signal.status)}
                            </Badge>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-xs text-slate-500 dark:text-slate-400">
                          {signal.sourceChannel ?? signal.ingestionSource ?? 'Manual'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3">
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => deleteSignalsMutation.mutate({ ids: selectedSignalIds })}
                  disabled={selectedSignalIds.length === 0}
                  isLoading={deleteSignalsMutation.isPending}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete selected ({selectedSignalIds.length})
                </Button>
                <Pagination {...signalsPagination} onPageChange={signalsPagination.setPage} />
              </div>
            </>
          )}
        </Card>

        <Card title="Execution Logs" eyebrow="Dispatch + Mapping">
          <div className="space-y-3">
            {overview.recentExecutionLogs.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-500">
                No execution logs yet.
              </p>
            ) : (
              logsPagination.pageItems.map((log) => (
                <div
                  key={log.id}
                  className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-950/60"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-slate-700 dark:text-slate-300">{log.message}</p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">
                        {log.accountId ?? 'All accounts'} • {formatTimestamp(log.createdAt)}
                      </p>
                      {detailText(log.details, 'resolvedSymbol') ? (
                        <p className="mt-2 text-xs text-sky-600 dark:text-sky-400">
                          Symbol mapped to {detailText(log.details, 'resolvedSymbol')}
                        </p>
                      ) : null}
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
                </div>
              ))
            )}
          </div>
          <Pagination {...logsPagination} onPageChange={logsPagination.setPage} />
        </Card>

        <Card title="Recent Trades" eyebrow="Lifecycle Feedback">
          <div className="space-y-3">
            {overview.recentTrades.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-500">
                No trade lifecycle events yet.
              </p>
            ) : (
              tradesPagination.pageItems.map((trade) => (
                <div
                  key={trade.id}
                  className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-950/60"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-950 dark:text-slate-100">
                        {trade.symbol} {trade.type} • {trade.accountId}
                      </p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">
                        Ticket {trade.ticket} • {formatTimestamp(trade.updatedAt)}
                      </p>
                    </div>
                    <Badge tone={trade.profit >= 0 ? 'positive' : 'danger'}>
                      {formatCurrency(trade.profit)}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </div>
          <Pagination {...tradesPagination} onPageChange={tradesPagination.setPage} />
        </Card>
      </div>

      {dispatchSignal ? (
        <ManualDispatchModal
          signal={dispatchSignal}
          onlineAccounts={onlineAccounts}
          onClose={() => setDispatchSignal(null)}
        />
      ) : null}

      {showFailsafeAlert ? (
        <Card
          title="Failsafe Alert"
          eyebrow="Execution Safety"
          description="Automatic execution is protected by connectivity and risk guardrails."
        >
          <div className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100">
            {!overview.eaOnline ? (
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>EA disconnected: execution pauses until at least one account is online.</p>
              </div>
            ) : null}
            {!overview.tradingEngine.telegramConnected ? (
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>Telegram disconnected: execution is blocked until Telegram reconnects.</p>
              </div>
            ) : null}
            {overview.tradingEngine.executionPaused ? (
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  Execution paused by failsafe: {overview.tradingEngine.executionPauseReason ?? 'Unknown reason'}.
                </p>
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
