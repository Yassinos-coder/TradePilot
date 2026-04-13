import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Radio, Send } from 'lucide-react';

import { apiClient } from '../lib/api';
import { queryClient } from '../lib/query-client';
import { useToastStore } from '../store/toast-store';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Skeleton } from '../components/ui/Skeleton';

const DEFAULT_MESSAGE = 'XAUUSD BUY ENTRY 2020 SL 2015 TP1 2025 TP2 2035';

function TelegramSkeleton() {
  return (
    <div className="max-w-4xl space-y-5">
      <Card title="Channel Routing" eyebrow="Telegram">
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-14 w-full" />
          ))}
        </div>
      </Card>
      <Card title="Signal Simulator" eyebrow="Testing">
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-10 w-28" />
        </div>
      </Card>
    </div>
  );
}

export function TelegramPage() {
  const pushToast = useToastStore((state) => state.push);
  const channelsQuery = useQuery({
    queryKey: ['telegram', 'channels'],
    queryFn: apiClient.channels,
  });

  const [channelId, setChannelId] = useState('');
  const [rawMessage, setRawMessage] = useState(DEFAULT_MESSAGE);

  useEffect(() => {
    if (channelsQuery.data?.length && !channelId) {
      setChannelId(channelsQuery.data[0]?.id ?? '');
    }
  }, [channelsQuery.data, channelId]);

  const toggleMutation = useMutation({
    mutationFn: apiClient.toggleChannel,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['telegram', 'channels'] });
      pushToast({
        tone: 'success',
        title: 'Channel updated',
        description: 'Telegram routing preferences were saved.',
      });
    },
    onError: () => {
      pushToast({
        tone: 'error',
        title: 'Channel update failed',
        description: 'TradePilot could not change the channel state.',
      });
    },
  });

  const simulateMutation = useMutation({
    mutationFn: apiClient.simulateSignal,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['overview'] });
      void queryClient.invalidateQueries({ queryKey: ['signals'] });
      void queryClient.invalidateQueries({ queryKey: ['logs'] });
      pushToast({
        tone: 'success',
        title: 'Signal queued',
        description: 'The raw message entered the ingestion pipeline.',
      });
    },
    onError: () => {
      pushToast({
        tone: 'error',
        title: 'Simulation failed',
        description: 'Enable a channel and verify the signal payload before retrying.',
      });
    },
  });

  if (channelsQuery.isLoading) {
    return <TelegramSkeleton />;
  }

  return (
    <div className="max-w-4xl space-y-5">
      <Card
        title="Channel Routing"
        eyebrow="Telegram"
        description="Toggle which mock channels are allowed to feed signals into the pipeline."
      >
        <div className="divide-y divide-gray-100 dark:divide-slate-800">
          {channelsQuery.data?.length === 0 ? (
            <p className="py-4 text-sm text-gray-400 dark:text-slate-500">
              No channels found.
            </p>
          ) : null}

          {channelsQuery.data?.map((channel) => (
            <div
              key={channel.id}
              className="flex items-center justify-between gap-4 py-3.5 first:pt-0 last:pb-0"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div
                  className={[
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                    channel.enabled
                      ? 'bg-blue-50 dark:bg-blue-500/10'
                      : 'bg-gray-100 dark:bg-slate-800',
                  ].join(' ')}
                >
                  <Radio
                    className={[
                      'h-4 w-4',
                      channel.enabled
                        ? 'text-blue-600 dark:text-blue-400'
                        : 'text-gray-400 dark:text-slate-500',
                    ].join(' ')}
                  />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-slate-100">
                    {channel.name}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-slate-500">
                    Mock Telegram source
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <Badge tone={channel.enabled ? 'positive' : 'neutral'} dot>
                  {channel.enabled ? 'Active' : 'Paused'}
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
      </Card>

      <Card
        title="Signal Simulator"
        eyebrow="Testing"
        description="Send a raw message through the queue to test parsing, guard checks, and dispatch."
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label
                htmlFor="sim-channel"
                className="text-xs font-medium text-gray-700 dark:text-slate-300"
              >
                Source channel
              </label>
              <select
                id="sim-channel"
                value={channelId}
                onChange={(event) => setChannelId(event.target.value)}
                className="h-9 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-blue-500"
              >
                {channelsQuery.data?.map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    {channel.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-medium text-gray-700 dark:text-slate-300">
                Quick templates
              </p>
              <div className="flex flex-wrap gap-2">
                {[
                  'XAUUSD BUY ENTRY 2020 SL 2015 TP1 2025 TP2 2035',
                  'EURUSD SELL ENTRY 1.0850 SL 1.0880 TP1 1.0820 TP2 1.0805',
                ].map((template) => (
                  <button
                    key={template}
                    type="button"
                    onClick={() => setRawMessage(template)}
                    className="rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-500 transition-colors hover:bg-gray-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
                  >
                    {template.slice(0, 22)}...
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="sim-message"
              className="text-xs font-medium text-gray-700 dark:text-slate-300"
            >
              Signal message
            </label>
            <textarea
              id="sim-message"
              value={rawMessage}
              onChange={(event) => setRawMessage(event.target.value)}
              rows={4}
              className="w-full resize-none rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-mono text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-600 dark:focus:border-blue-500"
              placeholder="XAUUSD BUY ENTRY 2020 SL 2015 TP1 2025 TP2 2035"
            />
          </div>

          <Button
            onClick={() => simulateMutation.mutate({ channelId, rawMessage })}
            isLoading={simulateMutation.isPending}
            disabled={!channelId || !rawMessage.trim()}
          >
            <Send className="h-3.5 w-3.5" />
            Queue signal
          </Button>
        </div>
      </Card>
    </div>
  );
}
