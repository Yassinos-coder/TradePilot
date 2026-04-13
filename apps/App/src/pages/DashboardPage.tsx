import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Activity,
  Wifi,
  WifiOff,
  TrendingUp,
  FileText,
  Key,
  Copy,
  Check,
  RotateCcw,
} from 'lucide-react';

import { apiClient } from '../lib/api';
import { queryClient } from '../lib/query-client';
import { formatTimestamp } from '../lib/utils';
import { useAuthStore } from '../store/auth-store';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EaSocketDemoCard } from '../components/dashboard/EaSocketDemoCard';

const STATUS_TONE = {
  DISPATCHED: 'positive',
  VALIDATED: 'info',
  PENDING: 'warning',
  FAILED: 'danger',
} as const;

export function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const [copied, setCopied] = useState(false);

  const overviewQuery = useQuery({
    queryKey: ['overview'],
    queryFn: apiClient.overview,
    refetchInterval: 15_000,
  });

  const signalsQuery = useQuery({
    queryKey: ['signals'],
    queryFn: apiClient.signals,
  });

  const logsQuery = useQuery({
    queryKey: ['logs'],
    queryFn: apiClient.executionLogs,
  });

  const rotateMutation = useMutation({
    mutationFn: apiClient.regenerateApiKey,
    onSuccess: (data) => {
      updateUser(data);
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });

  const copyApiKey = async () => {
    if (!user?.apiKey) return;
    await navigator.clipboard.writeText(user.apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const overview = overviewQuery.data;
  const signals = signalsQuery.data ?? [];
  const logs = logsQuery.data ?? [];

  const stats = [
    {
      label: 'EA Status',
      value: overview?.eaOnline ? 'Connected' : 'Offline',
      icon: overview?.eaOnline ? Wifi : WifiOff,
      iconBg: overview?.eaOnline ? 'bg-emerald-50 dark:bg-emerald-500/10' : 'bg-gray-100 dark:bg-slate-800',
      iconColor: overview?.eaOnline ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400 dark:text-slate-500',
      sub: overview?.eaOnline ? 'WebSocket active' : 'Waiting for EA',
    },
    {
      label: 'Total Signals',
      value: overview?.signalCount ?? signals.length,
      icon: TrendingUp,
      iconBg: 'bg-blue-50 dark:bg-blue-500/10',
      iconColor: 'text-blue-600 dark:text-blue-400',
      sub: 'All time processed',
    },
    {
      label: 'Execution Logs',
      value: logs.length,
      icon: FileText,
      iconBg: 'bg-violet-50 dark:bg-violet-500/10',
      iconColor: 'text-violet-600 dark:text-violet-400',
      sub: 'Recent entries',
    },
    {
      label: 'API Key',
      value: user?.apiKey ? `••••${user.apiKey.slice(-6)}` : '—',
      icon: Key,
      iconBg: 'bg-amber-50 dark:bg-amber-500/10',
      iconColor: 'text-amber-600 dark:text-amber-400',
      sub: 'EA authentication',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, iconBg, iconColor, sub }) => (
          <div
            key={label}
            className="rounded-xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-gray-500 dark:text-slate-400">{label}</span>
              <div className={['flex h-7 w-7 items-center justify-center rounded-lg', iconBg].join(' ')}>
                <Icon className={['h-3.5 w-3.5', iconColor].join(' ')} />
              </div>
            </div>
            <p className="text-2xl font-semibold text-gray-900 dark:text-white truncate">{value}</p>
            <p className="mt-0.5 text-xs text-gray-400 dark:text-slate-500">{sub}</p>
          </div>
        ))}
      </div>

      {/* API Key + EA Demo */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="API Key"
          eyebrow="EA Authentication"
          description="Your EA uses this key to authenticate with the WebSocket gateway."
        >
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 px-3 py-2.5">
              <Key className="h-3.5 w-3.5 shrink-0 text-gray-400 dark:text-slate-500" />
              <code className="flex-1 truncate text-xs font-mono text-gray-700 dark:text-slate-300">
                {user?.apiKey ?? 'No key found'}
              </code>
              <button
                type="button"
                onClick={copyApiKey}
                className="shrink-0 text-gray-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                title={copied ? 'Copied!' : 'Copy to clipboard'}
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
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

      {/* Activity tables */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Recent Signals" eyebrow="Signal Pipeline">
          <div className="divide-y divide-gray-100 dark:divide-slate-800">
            {signals.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400 dark:text-slate-500">
                No signals yet — simulate one from the Telegram page.
              </p>
            ) : (
              signals.slice(0, 8).map((sig) => (
                <div
                  key={sig.id}
                  className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Activity className="h-3 w-3 shrink-0 text-gray-300 dark:text-slate-600" />
                    <span className="truncate text-xs text-gray-600 dark:text-slate-400 font-mono">
                      {sig.rawMessage?.slice(0, 42) ?? '—'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge tone={STATUS_TONE[sig.status as keyof typeof STATUS_TONE] ?? 'neutral'} dot>
                      {sig.status}
                    </Badge>
                    <span className="hidden text-xs text-gray-400 dark:text-slate-600 sm:block">
                      {formatTimestamp(sig.createdAt)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card title="Execution Logs" eyebrow="Dispatch History">
          <div className="divide-y divide-gray-100 dark:divide-slate-800">
            {logs.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400 dark:text-slate-500">
                No execution logs yet.
              </p>
            ) : (
              logs.slice(0, 8).map((log) => (
                <div key={log.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <span className="truncate text-xs text-gray-600 dark:text-slate-400">
                    {log.message ?? 'Signal dispatched'}
                  </span>
                  <Badge
                    tone={
                      log.status === 'DISPATCHED' ? 'positive' :
                      log.status === 'FAILED' ? 'danger' :
                      log.status === 'RETRIED' ? 'warning' : 'neutral'
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
    </div>
  );
}
