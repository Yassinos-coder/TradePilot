import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Link2,
  LockKeyhole,
  MessageSquareShare,
  RefreshCw,
  Smartphone,
  Unplug,
} from 'lucide-react';

import { apiClient } from '../lib/api';
import { queryClient } from '../lib/query-client';
import { useToastStore } from '../store/toast-store';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Skeleton } from '../components/ui/Skeleton';

function TelegramSkeleton() {
  return (
    <div className="max-w-5xl space-y-5">
      <Card title="Telegram Account" eyebrow="Integration">
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-36" />
        </div>
      </Card>
      <Card title="Channel Routing" eyebrow="Live Channels">
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-14 w-full" />
          ))}
        </div>
      </Card>
    </div>
  );
}

function statusTone(status: string) {
  if (status === 'CONNECTED') {
    return 'positive' as const;
  }

  if (status === 'PENDING_CODE' || status === 'PENDING_PASSWORD') {
    return 'warning' as const;
  }

  if (status === 'ERROR') {
    return 'danger' as const;
  }

  return 'neutral' as const;
}

function statusLabel(status: string) {
  switch (status) {
    case 'PENDING_CODE':
      return 'Awaiting code';
    case 'PENDING_PASSWORD':
      return 'Awaiting password';
    case 'CONNECTED':
      return 'Connected';
    case 'ERROR':
      return 'Needs attention';
    default:
      return 'Disconnected';
  }
}

export function TelegramPage() {
  const pushToast = useToastStore((state) => state.push);
  const connectionQuery = useQuery({
    queryKey: ['telegram', 'connection'],
    queryFn: apiClient.telegramConnection,
  });
  const channelsQuery = useQuery({
    queryKey: ['telegram', 'channels'],
    queryFn: apiClient.channels,
    enabled: connectionQuery.data?.status === 'CONNECTED',
  });

  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [password, setPassword] = useState('');
  const [codeDelivery, setCodeDelivery] = useState<'APP' | 'SMS' | null>(null);

  useEffect(() => {
    if (connectionQuery.data?.phoneNumber) {
      setPhoneNumber(connectionQuery.data.phoneNumber);
    }
  }, [connectionQuery.data?.phoneNumber]);

  const refreshTelegramState = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['telegram', 'connection'] }),
      queryClient.invalidateQueries({ queryKey: ['telegram', 'channels'] }),
    ]);
  };

  const startConnectionMutation = useMutation({
    mutationFn: apiClient.startTelegramConnection,
    onSuccess: async (result) => {
      setCodeDelivery(result.codeDelivery);
      setPhoneCode('');
      setPassword('');
      await refreshTelegramState();
      pushToast({
        tone: 'success',
        title: 'Code sent',
        description:
          result.codeDelivery === 'APP'
            ? 'Telegram sent the login code to your Telegram app.'
            : 'Telegram sent the login code by SMS.',
      });
    },
    onError: (error) => {
      pushToast({
        tone: 'error',
        title: 'Could not start Telegram login',
        description:
          error instanceof Error
            ? error.message
            : 'Check the phone number and the server Telegram credentials.',
      });
    },
  });

  const verifyCodeMutation = useMutation({
    mutationFn: apiClient.verifyTelegramCode,
    onSuccess: async (result) => {
      await refreshTelegramState();
      if (result.status === 'PENDING_PASSWORD') {
        pushToast({
          tone: 'info',
          title: 'Telegram 2FA required',
          description: 'Enter your Telegram two-step verification password to finish setup.',
        });
        return;
      }

      pushToast({
        tone: 'success',
        title: 'Telegram connected',
        description: 'TradePilot can now sync your real Telegram channels.',
      });
    },
    onError: (error) => {
      pushToast({
        tone: 'error',
        title: 'Code verification failed',
        description:
          error instanceof Error ? error.message : 'The verification code was rejected.',
      });
    },
  });

  const verifyPasswordMutation = useMutation({
    mutationFn: apiClient.verifyTelegramPassword,
    onSuccess: async () => {
      await refreshTelegramState();
      pushToast({
        tone: 'success',
        title: 'Telegram connected',
        description: 'Two-step verification completed successfully.',
      });
    },
    onError: (error) => {
      pushToast({
        tone: 'error',
        title: 'Password verification failed',
        description:
          error instanceof Error ? error.message : 'The Telegram password was rejected.',
      });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: apiClient.disconnectTelegramConnection,
    onSuccess: async () => {
      setPhoneCode('');
      setPassword('');
      setCodeDelivery(null);
      await refreshTelegramState();
      pushToast({
        tone: 'success',
        title: 'Telegram disconnected',
        description: 'The saved Telegram session and synced channels were removed.',
      });
    },
    onError: (error) => {
      pushToast({
        tone: 'error',
        title: 'Could not disconnect Telegram',
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    },
  });

  const syncMutation = useMutation({
    mutationFn: apiClient.syncTelegramChannels,
    onSuccess: async (result) => {
      await refreshTelegramState();
      pushToast({
        tone: 'success',
        title: 'Channels synced',
        description: `${result.syncedCount} Telegram channels are now available for routing.`,
      });
    },
    onError: (error) => {
      pushToast({
        tone: 'error',
        title: 'Channel sync failed',
        description:
          error instanceof Error ? error.message : 'TradePilot could not read your Telegram dialogs.',
      });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: apiClient.toggleChannel,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['telegram', 'channels'] });
      pushToast({
        tone: 'success',
        title: 'Routing updated',
        description: 'TradePilot saved the channel listening preference.',
      });
    },
    onError: (error) => {
      pushToast({
        tone: 'error',
        title: 'Channel update failed',
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    },
  });

  if (connectionQuery.isLoading) {
    return <TelegramSkeleton />;
  }

  const connection = connectionQuery.data;
  const isConnected = connection?.status === 'CONNECTED';

  return (
    <div className="max-w-5xl space-y-5">
      <Card
        title="Telegram Account"
        eyebrow="Integration"
        description="Connect your real Telegram account so TradePilot can sync the channels you want to monitor."
        actions={
          <Badge tone={statusTone(connection?.status ?? 'DISCONNECTED')} dot>
            {statusLabel(connection?.status ?? 'DISCONNECTED')}
          </Badge>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/60">
              <p className="text-[11px] uppercase tracking-widest text-gray-400 dark:text-slate-500">
                Phone
              </p>
              <p className="mt-1 text-sm font-medium text-gray-900 dark:text-slate-100">
                {connection?.phoneNumber ?? 'Not connected'}
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/60">
              <p className="text-[11px] uppercase tracking-widest text-gray-400 dark:text-slate-500">
                Account
              </p>
              <p className="mt-1 text-sm font-medium text-gray-900 dark:text-slate-100">
                {connection?.displayName ?? connection?.username ?? 'Not available yet'}
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/60">
              <p className="text-[11px] uppercase tracking-widest text-gray-400 dark:text-slate-500">
                Last Sync
              </p>
              <p className="mt-1 text-sm font-medium text-gray-900 dark:text-slate-100">
                {connection?.lastSyncedAt
                  ? new Date(connection.lastSyncedAt).toLocaleString()
                  : 'Not synced'}
              </p>
            </div>
          </div>

          {connection?.lastError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
              {connection.lastError}
            </div>
          ) : null}

          {!isConnected && connection?.status !== 'PENDING_CODE' && connection?.status !== 'PENDING_PASSWORD' ? (
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
              <Input
                label="Telegram phone number"
                value={phoneNumber}
                onChange={(event) => setPhoneNumber(event.target.value)}
                placeholder="+212600000000"
                hint="Use the same international phone number format that your Telegram account uses."
                prefix={<Smartphone className="h-4 w-4" />}
              />
              <Button
                onClick={() => startConnectionMutation.mutate({ phoneNumber })}
                isLoading={startConnectionMutation.isPending}
                disabled={!phoneNumber.trim()}
              >
                <Link2 className="h-3.5 w-3.5" />
                Send login code
              </Button>
            </div>
          ) : null}

          {connection?.status === 'PENDING_CODE' ? (
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
              <Input
                label="Telegram verification code"
                value={phoneCode}
                onChange={(event) => setPhoneCode(event.target.value)}
                placeholder="12345"
                hint={
                  codeDelivery === 'SMS'
                    ? 'Enter the SMS code Telegram sent to your phone.'
                    : 'Enter the code Telegram sent inside the Telegram app.'
                }
                prefix={<MessageSquareShare className="h-4 w-4" />}
              />
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => startConnectionMutation.mutate({ phoneNumber })}
                  isLoading={startConnectionMutation.isPending}
                  disabled={!phoneNumber.trim()}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Resend
                </Button>
                <Button
                  onClick={() => verifyCodeMutation.mutate({ phoneCode })}
                  isLoading={verifyCodeMutation.isPending}
                  disabled={!phoneCode.trim()}
                >
                  Verify code
                </Button>
              </div>
            </div>
          ) : null}

          {connection?.status === 'PENDING_PASSWORD' ? (
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
              <Input
                label="Telegram two-step password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Your Telegram password"
                hint="TradePilot uses this once to finish login and never stores the password."
                prefix={<LockKeyhole className="h-4 w-4" />}
              />
              <Button
                onClick={() => verifyPasswordMutation.mutate({ password })}
                isLoading={verifyPasswordMutation.isPending}
                disabled={!password}
              >
                Verify password
              </Button>
            </div>
          ) : null}

          {isConnected ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => syncMutation.mutate()}
                isLoading={syncMutation.isPending}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Sync channels
              </Button>
              <Button
                variant="danger"
                onClick={() => disconnectMutation.mutate()}
                isLoading={disconnectMutation.isPending}
              >
                <Unplug className="h-3.5 w-3.5" />
                Disconnect account
              </Button>
            </div>
          ) : null}
        </div>
      </Card>

      <Card
        title="Channel Routing"
        eyebrow="Live Channels"
        description="Enable only the Telegram groups or channels that should feed messages into the TradePilot pipeline."
        actions={
          isConnected ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => syncMutation.mutate()}
              isLoading={syncMutation.isPending}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Sync
            </Button>
          ) : undefined
        }
      >
        {!isConnected ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center dark:border-slate-800 dark:bg-slate-950/60">
            <p className="text-sm font-medium text-gray-900 dark:text-slate-100">
              Connect Telegram first
            </p>
            <p className="mt-1 text-sm text-gray-500 dark:text-slate-500">
              Once your account is verified, TradePilot will sync your real channels here.
            </p>
          </div>
        ) : channelsQuery.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-14 w-full" />
            ))}
          </div>
        ) : channelsQuery.data?.length ? (
          <div className="divide-y divide-gray-100 dark:divide-slate-800">
            {channelsQuery.data.map((channel) => (
              <div
                key={channel.id}
                className="flex items-center justify-between gap-4 py-3.5 first:pt-0 last:pb-0"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <p className="truncate text-sm font-medium text-gray-900 dark:text-slate-100">
                      {channel.name}
                    </p>
                    <Badge tone={channel.kind === 'CHANNEL' ? 'info' : 'neutral'}>
                      {channel.kind === 'CHANNEL' ? 'Channel' : 'Group'}
                    </Badge>
                  </div>
                  <p className="truncate text-xs text-gray-400 dark:text-slate-500">
                    {channel.username ? `@${channel.username}` : channel.externalId}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-3">
                  <Badge tone={channel.enabled ? 'positive' : 'neutral'} dot>
                    {channel.enabled ? 'Listening' : 'Ignored'}
                  </Badge>
                  <Button
                    variant={channel.enabled ? 'secondary' : 'primary'}
                    size="sm"
                    onClick={() => toggleMutation.mutate(channel.id)}
                    isLoading={
                      toggleMutation.isPending && toggleMutation.variables === channel.id
                    }
                  >
                    {channel.enabled ? 'Disable' : 'Enable'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center dark:border-slate-800 dark:bg-slate-950/60">
            <p className="text-sm font-medium text-gray-900 dark:text-slate-100">
              No channels synced yet
            </p>
            <p className="mt-1 text-sm text-gray-500 dark:text-slate-500">
              Use the sync button to fetch the channels and groups available on your Telegram account.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
