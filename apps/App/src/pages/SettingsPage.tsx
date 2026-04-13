import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Save } from 'lucide-react';

import { SettingsDTO } from '@tradepilot/shared';

import { apiClient } from '../lib/api';
import { queryClient } from '../lib/query-client';
import { useToastStore } from '../store/toast-store';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Skeleton } from '../components/ui/Skeleton';
import { Toggle } from '../components/ui/Toggle';

const SYMBOLS = ['XAUUSD', 'EURUSD', 'GBPUSD', 'BTCUSD', 'NAS100', 'US30'] as const;
const MODE_OPTIONS = [
  {
    value: 'AUTO' as const,
    title: 'Auto',
    description: 'Validated signals are dispatched to the EA immediately.',
  },
  {
    value: 'SEMI_AUTO' as const,
    title: 'Semi-auto',
    description: 'Signals are validated and logged, but live dispatch is skipped.',
  },
  {
    value: 'MANUAL' as const,
    title: 'Manual',
    description: 'Signals are stored only for review and no dispatch occurs.',
  },
];

function SettingsSkeleton() {
  return (
    <div className="max-w-2xl space-y-5">
      {Array.from({ length: 4 }).map((_, index) => (
        <Card key={index} title="Loading" eyebrow="Settings">
          <div className="space-y-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-2/3" />
          </div>
        </Card>
      ))}
    </div>
  );
}

export function SettingsPage() {
  const pushToast = useToastStore((state) => state.push);
  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: apiClient.settings,
  });

  const [draft, setDraft] = useState<SettingsDTO | null>(null);

  useEffect(() => {
    if (settingsQuery.data && !draft) {
      setDraft(settingsQuery.data);
    }
  }, [settingsQuery.data, draft]);

  const updateMutation = useMutation({
    mutationFn: apiClient.updateSettings,
    onMutate: async (nextDraft) => {
      await queryClient.cancelQueries({ queryKey: ['settings'] });
      const previous = queryClient.getQueryData<SettingsDTO>(['settings']);
      queryClient.setQueryData(['settings'], nextDraft);

      return { previous };
    },
    onSuccess: (data) => {
      setDraft(data);
      queryClient.setQueryData(['settings'], data);
      pushToast({
        tone: 'success',
        title: 'Settings saved',
        description: `Execution mode is now ${data.mode}.`,
      });
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['settings'], context.previous);
        setDraft(context.previous);
      }

      pushToast({
        tone: 'error',
        title: 'Settings save failed',
        description: 'Your previous configuration has been restored.',
      });
    },
  });

  if (settingsQuery.isLoading && !draft) {
    return <SettingsSkeleton />;
  }

  if (!draft) {
    return (
      <Card title="Settings unavailable" eyebrow="Configuration">
        <p className="text-sm text-gray-500 dark:text-slate-400">
          TradePilot could not load the current settings profile.
        </p>
      </Card>
    );
  }

  const isDirty = JSON.stringify(draft) !== JSON.stringify(settingsQuery.data);

  const toggleSymbol = (symbol: string) => {
    const allowedSymbols = draft.allowedSymbols.includes(symbol)
      ? draft.allowedSymbols.filter((item) => item !== symbol)
      : [...draft.allowedSymbols, symbol];

    setDraft({
      ...draft,
      allowedSymbols,
    });
  };

  const handleSave = () => {
    updateMutation.mutate(draft);
  };

  return (
    <div className="max-w-2xl space-y-5">
      <Card
        title="Execution Mode"
        eyebrow="Safety"
        description="TradePilot applies this mode before any dispatch attempt."
      >
        <div className="grid gap-3 md:grid-cols-3">
          {MODE_OPTIONS.map((option) => {
            const selected = draft.mode === option.value;

            return (
              <button
                key={option.value}
                type="button"
                onClick={() =>
                  setDraft({
                    ...draft,
                    mode: option.value,
                  })
                }
                className={[
                  'rounded-xl border px-4 py-4 text-left transition-colors',
                  selected
                    ? 'border-blue-500 bg-blue-50 dark:border-blue-500 dark:bg-blue-500/10'
                    : 'border-gray-200 bg-white hover:border-gray-300 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600',
                ].join(' ')}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                    {option.title}
                  </p>
                  <Badge tone={selected ? 'info' : 'neutral'}>{option.value}</Badge>
                </div>
                <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-slate-400">
                  {option.description}
                </p>
              </button>
            );
          })}
        </div>
      </Card>

      <Card
        title="Risk Controls"
        eyebrow="Capital Protection"
        description="These limits are evaluated before each dispatch attempt."
      >
        <div className="space-y-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-gray-700 dark:text-slate-300">
                Risk per trade
              </label>
              <Badge tone="info">{draft.riskPercent}%</Badge>
            </div>
            <input
              id="risk-percent"
              type="range"
              min={0.1}
              max={10}
              step={0.1}
              value={draft.riskPercent}
              aria-label="Risk percent per trade"
              onChange={(event) =>
                setDraft({
                  ...draft,
                  riskPercent: Number(event.target.value),
                })
              }
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-gray-200 accent-blue-600 dark:bg-slate-700"
            />
            <div className="flex justify-between text-xs text-gray-400 dark:text-slate-600">
              <span>0.1%</span>
              <span>10%</span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-gray-700 dark:text-slate-300">
                Max trades per rolling window
              </label>
              <Badge tone="neutral">{draft.maxTrades}</Badge>
            </div>
            <input
              id="max-trades"
              type="range"
              min={1}
              max={20}
              step={1}
              value={draft.maxTrades}
              aria-label="Maximum trades"
              onChange={(event) =>
                setDraft({
                  ...draft,
                  maxTrades: Number(event.target.value),
                })
              }
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-gray-200 accent-blue-600 dark:bg-slate-700"
            />
            <div className="flex justify-between text-xs text-gray-400 dark:text-slate-600">
              <span>1</span>
              <span>20</span>
            </div>
          </div>
        </div>
      </Card>

      <Card
        title="Trading Sessions"
        eyebrow="Time Filters"
        description="Only enabled sessions should be considered tradable."
      >
        <div className="space-y-2">
          <Toggle
            label="London session"
            description="Primary European flow"
            checked={draft.sessions.london}
            onCheckedChange={(value) =>
              setDraft({
                ...draft,
                sessions: {
                  ...draft.sessions,
                  london: value,
                },
              })
            }
          />
          <Toggle
            label="New York session"
            description="US overlap and volatility window"
            checked={draft.sessions.newYork}
            onCheckedChange={(value) =>
              setDraft({
                ...draft,
                sessions: {
                  ...draft.sessions,
                  newYork: value,
                },
              })
            }
          />
        </div>
      </Card>

      <Card
        title="Allowed Symbols"
        eyebrow="Instrument Filter"
        description="Signals for symbols outside this list are rejected by the execution guard."
      >
        <div className="flex flex-wrap gap-2">
          {SYMBOLS.map((symbol) => {
            const selected = draft.allowedSymbols.includes(symbol);

            return (
              <button
                key={symbol}
                type="button"
                onClick={() => toggleSymbol(symbol)}
                className={[
                  'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                  selected
                    ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-400'
                    : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-slate-600',
                ].join(' ')}
              >
                {symbol}
              </button>
            );
          })}
        </div>
      </Card>

      <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-slate-400">
          <span
            className={[
              'h-2 w-2 rounded-full',
              isDirty ? 'bg-amber-500' : 'bg-emerald-500',
            ].join(' ')}
          />
          {isDirty ? 'Unsaved changes' : 'All settings synced'}
        </div>
        <Button
          onClick={handleSave}
          isLoading={updateMutation.isPending}
          disabled={!isDirty}
          size="sm"
        >
          <Save className="h-3.5 w-3.5" />
          Save settings
        </Button>
      </div>
    </div>
  );
}
