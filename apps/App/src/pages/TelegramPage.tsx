import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Send, Radio } from 'lucide-react';

import { apiClient } from '../lib/api';
import { queryClient } from '../lib/query-client';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';

const DEFAULT_MESSAGE = 'XAUUSD BUY ENTRY 2020 SL 2015 TP1 2025 TP2 2035';

export function TelegramPage() {
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['telegram', 'channels'] }),
  });

  const simulateMutation = useMutation({
    mutationFn: apiClient.simulateSignal,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['overview'] });
      queryClient.invalidateQueries({ queryKey: ['signals'] });
    },
  });

  return (
    <div className="max-w-4xl space-y-5">
      {/* Channel list */}
      <Card
        title="Channel Routing"
        eyebrow="Telegram"
        description="Toggle which mock channels are allowed to feed signals into the pipeline."
      >
        <div className="divide-y divide-gray-100 dark:divide-slate-800">
          {channelsQuery.data?.length === 0 && (
            <p className="py-4 text-sm text-gray-400 dark:text-slate-500">No channels found.</p>
          )}
          {channelsQuery.data?.map((ch) => (
            <div
              key={ch.id}
              className="flex items-center justify-between gap-4 py-3.5 first:pt-0 last:pb-0"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className={[
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                  ch.enabled
                    ? 'bg-blue-50 dark:bg-blue-500/10'
                    : 'bg-gray-100 dark:bg-slate-800',
                ].join(' ')}>
                  <Radio className={[
                    'h-4 w-4',
                    ch.enabled
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-gray-400 dark:text-slate-500',
                  ].join(' ')} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-slate-100">{ch.name}</p>
                  <p className="text-xs text-gray-400 dark:text-slate-500">Mock Telegram source</p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <Badge tone={ch.enabled ? 'positive' : 'neutral'} dot>
                  {ch.enabled ? 'Active' : 'Paused'}
                </Badge>
                <Button
                  variant={ch.enabled ? 'secondary' : 'primary'}
                  size="sm"
                  onClick={() => toggleMutation.mutate(ch.id)}
                  isLoading={toggleMutation.isPending && toggleMutation.variables === ch.id}
                >
                  {ch.enabled ? 'Disable' : 'Enable'}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Signal simulator */}
      <Card
        title="Signal Simulator"
        eyebrow="Testing"
        description="Send a raw message through the pipeline to test parsing and dispatch."
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Channel selector */}
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
                onChange={(e) => setChannelId(e.target.value)}
                className="h-9 w-full rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 dark:focus:border-blue-500"
              >
                {channelsQuery.data?.map((ch) => (
                  <option key={ch.id} value={ch.id}>{ch.name}</option>
                ))}
              </select>
            </div>

            {/* Example signals quick-fill */}
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-gray-700 dark:text-slate-300">Quick templates</p>
              <div className="flex flex-wrap gap-2">
                {[
                  'XAUUSD BUY ENTRY 2020 SL 2015 TP1 2025 TP2 2035',
                  'EURUSD SELL @ 1.0850 SL: 1.0880 TP: 1.0820',
                ].map((tpl) => (
                  <button
                    key={tpl}
                    type="button"
                    onClick={() => setRawMessage(tpl)}
                    className="rounded-md border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 px-2.5 py-1 text-xs text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors truncate max-w-[180px]"
                  >
                    {tpl.slice(0, 20)}…
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Message textarea */}
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
              onChange={(e) => setRawMessage(e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm font-mono text-gray-900 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 dark:focus:border-blue-500 resize-none"
              placeholder="XAUUSD BUY ENTRY 2020 SL 2015 TP1 2025 TP2 2035"
            />
          </div>

          {simulateMutation.isSuccess && (
            <div className="rounded-lg border border-emerald-200 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
              Signal queued — check the Dashboard for status updates.
            </div>
          )}

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
