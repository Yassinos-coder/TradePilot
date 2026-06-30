import { FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Filter,
  Key,
  KeyRound,
  MessageSquareText,
  PauseCircle,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  TimerReset,
  Trash2,
  TrendingUp,
  UsersRound,
  Wallet,
  Wifi,
  WifiOff,
  Zap,
} from 'lucide-react';

import type { CopierProgramDTO, FollowerDeviceDTO, SignalHistoryFilter, SignalRecordDTO } from '@tradepilot/shared';

import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { ManualDispatchModal } from '@/components/ui/ManualDispatchModal';
import { Pagination } from '@/components/ui/Pagination';
import { Skeleton } from '@/components/ui/Skeleton';
import { apiClient } from '@/lib/api';
import { formatCurrency, formatLatency, formatPercent, formatTimestamp } from '@/lib/utils';
import { queryClient } from '@/lib/query-client';
import { useAuthStore } from '@/store/auth-store';
import { useToastStore } from '@/store/toast-store';
import { usePagination } from '@/hooks/usePagination';

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

const SIGNAL_FILTER_OPTIONS: Array<{ label: string; value: SignalHistoryFilter }> = [
  { label: 'All', value: 'ALL' },
  { label: 'Signals', value: 'SIGNALS' },
  { label: 'Management', value: 'MANAGEMENT' },
  { label: 'Noise', value: 'NOISE' },
];

function renderSignalSummary(signal: { rawMessage: string; parsedData?: { action: string; symbol: string; type: string | null } | null }) {
  if (!signal.parsedData) return signal.rawMessage;
  return [signal.parsedData.action, signal.parsedData.symbol, signal.parsedData.type].filter(Boolean).join(' ');
}

function signalStatusLabel(status: string) {
  const labels: Record<string, string> = {
    PARSED: 'Parsed',
    VALIDATION_FAILED: 'Validation failed',
    EXECUTED: 'Executed',
    IGNORED: 'Ignored',
    BLOCKED: 'Blocked',
    AUTO_COPY_DISABLED: 'Auto-copy disabled',
    SYMBOL_UNRESOLVED: 'Symbol unresolved',
  };
  return labels[status] ?? status.replace(/_/g, ' ');
}

function detailText(details: Record<string, unknown> | null | undefined, key: string) {
  const value = details?.[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function programStatusTone(status: CopierProgramDTO['status']): BadgeTone {
  if (status === 'ACTIVE') return 'positive';
  if (status === 'PAUSED') return 'warning';
  return 'danger';
}

function followerStatusTone(status: FollowerDeviceDTO['status']): BadgeTone {
  if (status === 'ACTIVE') return 'positive';
  if (status === 'PENDING_APPROVAL') return 'warning';
  return 'danger';
}

export function TradeCopierPage() {
  const user = useAuthStore((state) => state.user);
  const updateUser = useAuthStore((state) => state.updateUser);
  const pushToast = useToastStore((state) => state.push);

  const [dispatchSignal, setDispatchSignal] = useState<SignalRecordDTO | null>(null);
  const [signalFilter, setSignalFilter] = useState<SignalHistoryFilter>('ALL');
  const [signalFilterTouched, setSignalFilterTouched] = useState(false);
  const [selectedSignalIds, setSelectedSignalIds] = useState<string[]>([]);

  const [programName, setProgramName] = useState('');
  const [description, setDescription] = useState('');
  const [maxFollowerDevices, setMaxFollowerDevices] = useState(10);
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null);

  const overviewQuery = useQuery({
    queryKey: ['overview'],
    queryFn: apiClient.overview,
    refetchInterval: 10_000,
  });

  const signalHistoryQuery = useQuery({
    queryKey: ['signals', 'history', signalFilter, signalFilterTouched],
    queryFn: () => apiClient.signals({ limit: 100, filter: signalFilter, includeNoise: signalFilter === 'ALL' ? signalFilterTouched : true }),
    refetchInterval: 10_000,
  });

  const programsQuery = useQuery({
    queryKey: ['trade-copier', 'programs'],
    queryFn: apiClient.copierPrograms,
  });

  const programs = programsQuery.data ?? [];
  const selectedProgram = useMemo(
    () => programs.find((p) => p.id === selectedProgramId) ?? programs[0] ?? null,
    [programs, selectedProgramId],
  );

  const followersQuery = useQuery({
    queryKey: ['trade-copier', 'followers', selectedProgram?.id],
    queryFn: () => apiClient.copierFollowers(selectedProgram!.id),
    enabled: Boolean(selectedProgram?.id),
  });

  const rotateMutation = useMutation({
    mutationFn: apiClient.regenerateApiKey,
    onSuccess: (data) => {
      updateUser(data);
      void queryClient.invalidateQueries({ queryKey: ['profile'] });
      pushToast({ tone: 'success', title: 'API key rotated', description: 'Reconnect your MetaTrader terminals with the new key.' });
    },
    onError: () => pushToast({ tone: 'error', title: 'API key rotation failed' }),
  });

  const autoCopyMutation = useMutation({
    mutationFn: apiClient.updateAutoCopy,
    onMutate: async (enabled) => {
      await queryClient.cancelQueries({ queryKey: ['overview'] });
      const previous = queryClient.getQueryData(['overview']);
      queryClient.setQueryData(['overview'], (current: any) =>
        current ? { ...current, tradingEngine: { ...current.tradingEngine, autoCopyEnabled: enabled } } : current,
      );
      return { previous };
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['overview'] }),
        queryClient.invalidateQueries({ queryKey: ['settings'] }),
      ]);
      pushToast({ tone: 'success', title: 'Auto copy trading updated' });
    },
    onError: (_error, _variables, context) => {
      pushToast({ tone: 'error', title: 'Auto copy toggle failed' });
      if (context?.previous) queryClient.setQueryData(['overview'], context.previous);
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
      pushToast({ tone: 'success', title: 'Signal history updated', description: `${result.deletedCount} row(s) removed.` });
    },
    onError: () => pushToast({ tone: 'error', title: 'Could not update signal history' }),
  });

  const createProgramMutation = useMutation({
    mutationFn: apiClient.createCopierProgram,
    onSuccess: async (program) => {
      setProgramName('');
      setDescription('');
      setMaxFollowerDevices(10);
      setRequiresApproval(false);
      setSelectedProgramId(program.id);
      await queryClient.invalidateQueries({ queryKey: ['trade-copier', 'programs'] });
      pushToast({ tone: 'success', title: 'Copier program created', description: 'Share the invite code with your clients.' });
    },
    onError: () => pushToast({ tone: 'error', title: 'Could not create copier program' }),
  });

  const rotateCodeMutation = useMutation({
    mutationFn: apiClient.rotateCopierInviteCode,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['trade-copier', 'programs'] });
      pushToast({ tone: 'success', title: 'Invite code rotated' });
    },
    onError: () => pushToast({ tone: 'error', title: 'Could not rotate invite code' }),
  });

  const updateProgramMutation = useMutation({
    mutationFn: ({ programId, status }: { programId: string; status: CopierProgramDTO['status'] }) =>
      apiClient.updateCopierProgram(programId, { status }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['trade-copier', 'programs'] });
      pushToast({ tone: 'success', title: 'Program status updated' });
    },
    onError: () => pushToast({ tone: 'error', title: 'Could not update program status' }),
  });

  const followerMutation = useMutation({
    mutationFn: ({ action, programId, deviceId }: { action: 'approve' | 'revoke'; programId: string; deviceId: string }) =>
      action === 'approve'
        ? apiClient.approveCopierFollower(programId, deviceId)
        : apiClient.revokeCopierFollower(programId, deviceId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['trade-copier', 'followers'] });
      await queryClient.invalidateQueries({ queryKey: ['trade-copier', 'programs'] });
      pushToast({ tone: 'success', title: 'Follower updated' });
    },
    onError: () => pushToast({ tone: 'error', title: 'Could not update follower' }),
  });

  const copyApiKey = async () => {
    if (!user?.apiKey) return;
    try {
      await navigator.clipboard.writeText(user.apiKey);
      pushToast({ tone: 'success', title: 'API key copied', description: 'Paste it into your EA settings to authenticate the terminal.' });
    } catch {
      pushToast({ tone: 'error', title: 'Copy failed', description: 'The browser blocked clipboard access.' });
    }
  };

  const copyInviteCode = async (code: string | null) => {
    if (!code) return;
    await navigator.clipboard.writeText(code);
    pushToast({ tone: 'success', title: 'Invite code copied', description: 'Send it with the EA download link to your clients.' });
  };

  const submitProgram = (event: FormEvent) => {
    event.preventDefault();
    createProgramMutation.mutate({ name: programName, description: description.trim() || null, maxFollowerDevices, requiresApproval });
  };

  const overview = overviewQuery.data;
  const signalHistory = signalHistoryQuery.data ?? [];

  const accountsPagination = usePagination(overview?.connectedAccounts ?? [], 10);
  const signalsPagination = usePagination(signalHistory, 8);
  const logsPagination = usePagination(overview?.recentExecutionLogs ?? [], 5);

  const onlineAccounts = overview?.connectedAccounts.filter((a) => a.online) ?? [];
  const lastTelegram = overview?.lastTelegramMessage;
  const showFailsafeAlert = overview && (!overview.eaOnline || !overview.tradingEngine.telegramConnected || overview.tradingEngine.executionPaused);

  return (
    <div className="space-y-6">
      {overview && (
        <Card
          title="Auto Copy Trading"
          eyebrow="Master Execution Toggle"
          description="Signal ingestion and analytics continue even when automatic trade execution is disabled."
        >
          <div className="sticky top-20 z-20 rounded-2xl border border-slate-200 bg-white/95 px-4 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-950 dark:text-slate-100">
                  {overview.tradingEngine.autoCopyEnabled ? '🟢 Auto Copy Enabled' : '🔴 Auto Copy Disabled'}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {overview.tradingEngine.autoCopyEnabled
                    ? 'Validated signals can be executed on connected accounts.'
                    : 'Signals are still parsed and logged, but no execution commands are sent.'}
                </p>
              </div>
              <button
                type="button"
                aria-label={overview.tradingEngine.autoCopyEnabled ? 'Disable auto copy' : 'Enable auto copy'}
                disabled={autoCopyMutation.isPending}
                onClick={() => autoCopyMutation.mutate(!overview.tradingEngine.autoCopyEnabled)}
                className={[
                  'relative h-9 w-20 rounded-full transition-colors',
                  overview.tradingEngine.autoCopyEnabled ? 'bg-emerald-500' : 'bg-red-500',
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
      )}

      {overview && (
        <Card title="Trading Engine" eyebrow="Execution Observability" description="Live execution readiness and failsafe health summary.">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[
              { label: 'EA Presence', value: overview.eaOnline ? `${onlineAccounts.length} online` : 'Offline', icon: overview.eaOnline ? Wifi : WifiOff },
              { label: 'Latency', value: formatLatency(overview.eaLatencyMs), icon: TimerReset },
              { label: 'Balance', value: formatCurrency(overview.accountStatus?.balance), icon: Wallet },
              { label: 'Win Rate', value: formatPercent(overview.analytics.winRate), icon: TrendingUp },
              { label: 'Auto-copy', value: overview.tradingEngine.autoCopyEnabled ? '🟢 Enabled' : '🔴 Disabled', icon: CheckCircle2 },
              { label: 'Risk status', value: overview.tradingEngine.riskStatus, icon: AlertTriangle },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/60">
                <div className="flex items-center gap-2">
                  <Icon className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
                  <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
                </div>
                <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{value}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {overview && (
        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <Card
            title="Connected Accounts"
            eyebrow="Multi-account EA"
            description="Live sockets, broker latency, and latest balance/equity per MetaTrader account."
            actions={
              <Button variant="secondary" size="sm" onClick={() => void overviewQuery.refetch()}>
                <RefreshCw className="h-3.5 w-3.5" /> Refresh
              </Button>
            }
          >
            {overview.connectedAccounts.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center dark:border-slate-800 dark:bg-slate-950/60">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">No accounts connected yet</p>
                <p className="mt-1 text-sm text-slate-500">Authenticate an MT4/MT5 EA with your API key to start routing.</p>
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
                        <tr key={account.id} className="border-b border-slate-100 last:border-b-0 dark:border-slate-800">
                          <td className="px-5 py-4">
                            <p className="font-medium text-slate-950 dark:text-slate-100">{account.name}</p>
                            <p className="text-xs text-slate-500">{account.externalAccountId ?? 'Manual entry'}</p>
                          </td>
                          <td className="px-5 py-4">
                            <Badge tone={account.online ? 'positive' : 'neutral'} dot>{account.online ? 'Online' : 'Offline'}</Badge>
                          </td>
                          <td className="px-5 py-4 text-slate-600 dark:text-slate-300">{formatLatency(account.latencyMs)}</td>
                          <td className="px-5 py-4 text-slate-600 dark:text-slate-300">{formatCurrency(account.latestStatus?.balance)}</td>
                          <td className="px-5 py-4 text-slate-600 dark:text-slate-300">{formatCurrency(account.latestStatus?.equity)}</td>
                          <td className="px-5 py-4 text-slate-500">{account.lastSeenAt ? formatTimestamp(account.lastSeenAt) : '--'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination className="px-1 pt-4" {...accountsPagination} onPageChange={accountsPagination.setPage} />
              </>
            )}
          </Card>

          <div className="space-y-4">
            <Card title="EA API Key" eyebrow="Authentication" description="Each MetaTrader terminal authenticates with this key during the WebSocket handshake.">
              <div className="space-y-3">
                <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-800 dark:bg-slate-950/70">
                  <Key className="h-4 w-4 shrink-0 text-slate-400" />
                  <code className="min-w-0 flex-1 truncate text-xs text-slate-700 dark:text-slate-300">
                    {user?.apiKey ?? 'No API key available'}
                  </code>
                  <button type="button" aria-label="Copy API key" onClick={() => void copyApiKey()} className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-sky-600 dark:hover:bg-slate-800 dark:hover:text-sky-400">
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
                <Button variant="secondary" size="sm" onClick={() => rotateMutation.mutate()} isLoading={rotateMutation.isPending}>
                  <RotateCcw className="h-3.5 w-3.5" /> Rotate key
                </Button>
              </div>
            </Card>

            {lastTelegram && (
              <Card title="Last Telegram Message" eyebrow="Ingestion">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <MessageSquareText className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                    <p className="text-sm font-medium text-slate-950 dark:text-slate-100">{renderSignalSummary(lastTelegram)}</p>
                  </div>
                  <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">{lastTelegram.rawMessage}</p>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone="info">{lastTelegram.telegramChannelId ?? 'Manual'}</Badge>
                    {lastTelegram.telegramMessageId ? <Badge tone="neutral">Msg {lastTelegram.telegramMessageId}</Badge> : null}
                    <Badge tone={SIGNAL_STATUS_TONES[lastTelegram.status as keyof typeof SIGNAL_STATUS_TONES] ?? 'neutral'}>
                      {lastTelegram.status}
                    </Badge>
                  </div>
                </div>
              </Card>
            )}
          </div>
        </div>
      )}

      {overview && (
        <div className="grid gap-4 xl:grid-cols-2">
          <Card
            title="Signal History"
            eyebrow="Classification + Status"
            actions={
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => { setSignalFilter('ALL'); setSignalFilterTouched(false); }}>
                  <Filter className="h-3.5 w-3.5" /> Reset
                </Button>
                <Button variant="danger" size="sm" onClick={() => deleteSignalsMutation.mutate({ clearAll: true })} isLoading={deleteSignalsMutation.isPending}>
                  <Trash2 className="h-3.5 w-3.5" /> Clear all
                </Button>
              </div>
            }
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <label className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">Filter</label>
              <select
                aria-label="Signal filter"
                value={signalFilter}
                onChange={(e) => { setSignalFilter(e.target.value as SignalHistoryFilter); setSignalFilterTouched(true); setSelectedSignalIds([]); }}
                className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
              >
                {SIGNAL_FILTER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            {signalHistoryQuery.isLoading ? (
              <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
            ) : signalHistory.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">No signals in this filter.</p>
            ) : (
              <>
                <div className="-mx-5 overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-slate-100 text-xs uppercase tracking-[0.22em] text-slate-400 dark:border-slate-800 dark:text-slate-500">
                      <tr>
                        <th className="px-5 py-3" aria-label="Select all">
                          <input
                            type="checkbox"
                            aria-label="Select all signals on this page"
                            checked={signalsPagination.pageItems.length > 0 && signalsPagination.pageItems.every((item) => selectedSignalIds.includes(item.id))}
                            onChange={(e) => {
                              if (e.target.checked) setSelectedSignalIds((prev) => Array.from(new Set([...prev, ...signalsPagination.pageItems.map((item) => item.id)])));
                              else setSelectedSignalIds((prev) => prev.filter((id) => !signalsPagination.pageItems.map((item) => item.id).includes(id)));
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
                        <tr key={signal.id} className="border-b border-slate-100 last:border-b-0 dark:border-slate-800">
                          <td className="px-5 py-3">
                            <input
                              type="checkbox"
                              aria-label={`Select signal ${signal.id}`}
                              checked={selectedSignalIds.includes(signal.id)}
                              onChange={(e) => setSelectedSignalIds((prev) => e.target.checked ? Array.from(new Set([...prev, signal.id])) : prev.filter((id) => id !== signal.id))}
                            />
                          </td>
                          <td className="px-5 py-3">
                            <p className="font-medium text-slate-900 dark:text-slate-100">{renderSignalSummary(signal)}</p>
                            <p className="text-xs text-slate-500">{formatTimestamp(signal.createdAt)}</p>
                          </td>
                          <td className="px-5 py-3">
                            <Badge tone={signal.classification === 'NOISE' ? 'warning' : 'info'}>{signal.classification}</Badge>
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              {(['VALIDATED', 'EA_OFFLINE', 'DISPATCH_TIMEOUT', 'BLOCKED'] as const).includes(signal.status as any) && (
                                <button type="button" aria-label="Execute manually" onClick={() => setDispatchSignal(signal)} className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-sky-50 hover:text-sky-600 dark:hover:bg-sky-500/10 dark:hover:text-sky-400">
                                  <Zap className="h-3.5 w-3.5" />
                                </button>
                              )}
                              <Badge tone={SIGNAL_STATUS_TONES[signal.status as keyof typeof SIGNAL_STATUS_TONES] ?? 'neutral'}>
                                {signalStatusLabel(signal.status)}
                              </Badge>
                            </div>
                          </td>
                          <td className="px-5 py-3 text-xs text-slate-500">{signal.sourceChannel ?? signal.ingestionSource ?? 'Manual'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <Button variant="danger" size="sm" onClick={() => deleteSignalsMutation.mutate({ ids: selectedSignalIds })} disabled={selectedSignalIds.length === 0} isLoading={deleteSignalsMutation.isPending}>
                    <Trash2 className="h-3.5 w-3.5" /> Delete selected ({selectedSignalIds.length})
                  </Button>
                  <Pagination {...signalsPagination} onPageChange={signalsPagination.setPage} />
                </div>
              </>
            )}
          </Card>

          <Card title="Execution Logs" eyebrow="Dispatch + Mapping">
            <div className="space-y-3">
              {overview.recentExecutionLogs.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">No execution logs yet.</p>
              ) : (
                logsPagination.pageItems.map((log) => (
                  <div key={log.id} className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-950/60">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm text-slate-700 dark:text-slate-300">{log.message}</p>
                        <p className="mt-1 text-xs text-slate-500">{log.accountId ?? 'All accounts'} • {formatTimestamp(log.createdAt)}</p>
                        {detailText(log.details, 'resolvedSymbol') && (
                          <p className="mt-2 text-xs text-sky-600 dark:text-sky-400">Symbol mapped to {detailText(log.details, 'resolvedSymbol')}</p>
                        )}
                      </div>
                      <Badge tone={EXECUTION_STATUS_TONES[log.status as keyof typeof EXECUTION_STATUS_TONES] ?? 'neutral'}>{log.status}</Badge>
                    </div>
                  </div>
                ))
              )}
            </div>
            <Pagination {...logsPagination} onPageChange={logsPagination.setPage} />
          </Card>
        </div>
      )}

      {showFailsafeAlert && (
        <Card title="Failsafe Alert" eyebrow="Execution Safety" description="Automatic execution is protected by connectivity and risk guardrails.">
          <div className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100">
            {!overview!.eaOnline && (
              <div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><p>EA disconnected: execution pauses until at least one account is online.</p></div>
            )}
            {!overview!.tradingEngine.telegramConnected && (
              <div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><p>Telegram disconnected: execution is blocked until Telegram reconnects.</p></div>
            )}
            {overview!.tradingEngine.executionPaused && (
              <div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><p>Execution paused by failsafe: {overview!.tradingEngine.executionPauseReason ?? 'Unknown reason'}.</p></div>
            )}
          </div>
        </Card>
      )}

      <div className="border-t border-slate-200 pt-6 dark:border-slate-800">
        <p className="mb-6 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          Community Copier Programs
        </p>

        <Card
          eyebrow="Community copier"
          title="Provider invite-code copier"
          description="You pay TradePilot, your Telegram clients enter your code in the EA, and their devices receive your trades without needing full TradePilot accounts."
        >
          <div className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
            <form className="space-y-4" onSubmit={submitProgram}>
              <Input label="Program name" placeholder="Yassine Gold Signals" value={programName} onChange={(e) => setProgramName(e.target.value)} required />
              <Input label="Short description" placeholder="London/New York XAUUSD copier" value={description} onChange={(e) => setDescription(e.target.value)} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Input label="Follower device limit" type="number" min={1} max={500} value={maxFollowerDevices} onChange={(e) => setMaxFollowerDevices(Number(e.target.value))} />
                <label className="flex items-center gap-3 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700 dark:border-slate-800 dark:text-slate-300">
                  <input type="checkbox" checked={requiresApproval} onChange={(e) => setRequiresApproval(e.target.checked)} />
                  Manual follower approval
                </label>
              </div>
              <Button type="submit" isLoading={createProgramMutation.isPending} disabled={!programName.trim()}>
                Create copier program
              </Button>
            </form>
            <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4 dark:border-blue-500/20 dark:bg-blue-500/10">
              <div className="flex items-center gap-2 text-sm font-semibold text-blue-800 dark:text-blue-200">
                <ShieldCheck className="h-4 w-4" />
                Safe V1 security model
              </div>
              <ul className="mt-3 space-y-2 text-sm text-blue-900/75 dark:text-blue-100/75">
                <li>• Never share your provider API key with followers.</li>
                <li>• Followers only use an invite code once to get a scoped device token.</li>
                <li>• Codes can be rotated, devices can be approved or revoked.</li>
                <li>• Provider and follower MetaTrader terminals must stay online.</li>
              </ul>
            </div>
          </div>
        </Card>

        <div className="mt-5 grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
          <Card title="Your copier programs" description="Create one program per Telegram room, VIP tier, or strategy.">
            {programsQuery.isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : programs.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-300 p-6 text-sm text-gray-500 dark:border-slate-700 dark:text-slate-400">
                No copier programs yet. Create one above to generate your first invite code.
              </div>
            ) : (
              <div className="space-y-3">
                {programs.map((program) => (
                  <button
                    key={program.id}
                    type="button"
                    onClick={() => setSelectedProgramId(program.id)}
                    className={`w-full rounded-2xl border p-4 text-left transition ${selectedProgram?.id === program.id ? 'border-blue-400 bg-blue-50 dark:border-blue-500 dark:bg-blue-500/10' : 'border-gray-200 hover:border-gray-300 dark:border-slate-800 dark:hover:border-slate-700'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-gray-950 dark:text-white">{program.name}</p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">{program.description || 'No description'}</p>
                      </div>
                      <Badge tone={programStatusTone(program.status)} dot>{program.status}</Badge>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2 text-xs text-gray-500 dark:text-slate-400">
                      <span><UsersRound className="mb-1 h-4 w-4" />{program.followerCount}/{program.maxFollowerDevices} devices</span>
                      <span><Wifi className="mb-1 h-4 w-4" />{program.onlineFollowerCount} online</span>
                      <span><KeyRound className="mb-1 h-4 w-4" />{program.activeInviteCode ?? 'No code'}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Card>

          <Card
            title={selectedProgram ? selectedProgram.name : 'Follower devices'}
            description="Anonymous EA devices that joined with your code."
            actions={
              selectedProgram ? (
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => copyInviteCode(selectedProgram.activeInviteCode)}>
                    <Copy className="h-3.5 w-3.5" /> Copy code
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => rotateCodeMutation.mutate(selectedProgram.id)} isLoading={rotateCodeMutation.isPending}>
                    <RotateCcw className="h-3.5 w-3.5" /> Rotate
                  </Button>
                </div>
              ) : null
            }
          >
            {selectedProgram ? (
              <div className="space-y-4">
                <div className="grid gap-3 rounded-2xl border border-gray-200 p-4 dark:border-slate-800 sm:grid-cols-3">
                  <div>
                    <p className="text-xs text-gray-500 dark:text-slate-400">Invite code</p>
                    <p className="mt-1 font-mono text-lg font-semibold text-gray-950 dark:text-white">{selectedProgram.activeInviteCode ?? '--'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-slate-400">Approval</p>
                    <p className="mt-1 text-sm font-semibold text-gray-950 dark:text-white">{selectedProgram.requiresApproval ? 'Manual' : 'Auto-approve'}</p>
                  </div>
                  <div className="flex items-end gap-2">
                    <Button
                      size="sm"
                      variant={selectedProgram.status === 'ACTIVE' ? 'secondary' : 'primary'}
                      onClick={() => updateProgramMutation.mutate({ programId: selectedProgram.id, status: selectedProgram.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE' })}
                    >
                      {selectedProgram.status === 'ACTIVE' ? 'Pause program' : 'Activate program'}
                    </Button>
                  </div>
                </div>
                {followersQuery.isLoading ? (
                  <Skeleton className="h-48 w-full" />
                ) : (followersQuery.data ?? []).length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-gray-300 p-6 text-sm text-gray-500 dark:border-slate-700 dark:text-slate-400">
                    No follower devices yet. Send the EA download link and code to your clients.
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-slate-800">
                    {(followersQuery.data ?? []).map((device) => (
                      <div key={device.id} className="grid gap-3 border-b border-gray-100 p-4 last:border-b-0 dark:border-slate-800 md:grid-cols-[1fr_auto]">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium text-gray-950 dark:text-white">{device.nickname || 'Unnamed device'}</p>
                            <Badge tone={followerStatusTone(device.status)} dot>{device.status.replace(/_/g, ' ')}</Badge>
                          </div>
                          <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                            {device.platform ?? 'MT'} • {device.brokerServer ?? 'Unknown broker'} • {device.accountLoginMasked ?? 'Masked account'} • Last seen {device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString() : 'never'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {device.status === 'PENDING_APPROVAL' && (
                            <Button size="sm" variant="secondary" onClick={() => followerMutation.mutate({ action: 'approve', programId: selectedProgram.id, deviceId: device.id })}>
                              <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                            </Button>
                          )}
                          {device.status !== 'REVOKED' && (
                            <Button size="sm" variant="danger" onClick={() => followerMutation.mutate({ action: 'revoke', programId: selectedProgram.id, deviceId: device.id })}>
                              Revoke
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-gray-300 p-6 text-sm text-gray-500 dark:border-slate-700 dark:text-slate-400">
                Select or create a copier program to manage invite codes and follower devices.
              </div>
            )}
          </Card>
        </div>
      </div>

      {dispatchSignal && (
        <ManualDispatchModal
          signal={dispatchSignal}
          onlineAccounts={onlineAccounts}
          onClose={() => setDispatchSignal(null)}
        />
      )}
    </div>
  );
}
