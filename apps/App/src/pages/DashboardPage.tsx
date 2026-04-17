import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Copy,
  Key,
  MessageSquareText,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
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

  return (
    <div className="space-y-6">
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
                Authenticate at least one MT4 or MT5 EA with your API key to start routing.
              </p>
            </div>
          ) : (
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
                  {overview.connectedAccounts.map((account) => (
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
        <Card title="Recent Signals" eyebrow="Pipeline">
          <div className="space-y-3">
            {overview.recentSignals.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-500">
                No signals processed yet.
              </p>
            ) : (
              overview.recentSignals.map((signal) => (
                <div
                  key={signal.id}
                  className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-950/60"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-950 dark:text-slate-100">
                        {renderSignalSummary(signal)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">
                        {signal.sourceChannel ?? 'Manual ingest'} • {formatTimestamp(signal.createdAt)}
                      </p>
                    </div>
                    <Badge
                      tone={
                        SIGNAL_STATUS_TONES[
                          signal.status as keyof typeof SIGNAL_STATUS_TONES
                        ] ?? 'neutral'
                      }
                    >
                      {signal.status}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card title="Execution Logs" eyebrow="Dispatch + Mapping">
          <div className="space-y-3">
            {overview.recentExecutionLogs.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-500">
                No execution logs yet.
              </p>
            ) : (
              overview.recentExecutionLogs.map((log) => (
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
        </Card>

        <Card title="Recent Trades" eyebrow="Lifecycle Feedback">
          <div className="space-y-3">
            {overview.recentTrades.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-500">
                No trade lifecycle events yet.
              </p>
            ) : (
              overview.recentTrades.map((trade) => (
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
        </Card>
      </div>

      {!overview.eaOnline ? (
        <Card
          title="Execution Safety"
          eyebrow="Guardrail"
          description="Signals are still stored and parsed even when no EA is connected."
        >
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Dispatch is paused until at least one authenticated EA account comes back online.
            </p>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
