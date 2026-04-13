import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Save, AlertCircle } from 'lucide-react';

import { SettingsDTO } from '@tradepilot/shared';

import { apiClient } from '../lib/api';
import { queryClient } from '../lib/query-client';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Toggle } from '../components/ui/Toggle';

const SYMBOLS = ['XAUUSD', 'EURUSD', 'GBPUSD', 'BTCUSD', 'NAS100', 'US30'] as const;

export function SettingsPage() {
  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: apiClient.settings,
  });

  const [draft, setDraft] = useState<SettingsDTO | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settingsQuery.data && !draft) {
      setDraft(settingsQuery.data);
    }
  }, [settingsQuery.data, draft]);

  const updateMutation = useMutation({
    mutationFn: apiClient.updateSettings,
    onSuccess: (data) => {
      setDraft(data);
      setSaved(true);
      queryClient.setQueryData(['settings'], data);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  const handleSave = () => {
    if (draft) updateMutation.mutate(draft);
  };

  const toggleSymbol = (sym: string) => {
    if (!draft) return;
    const current = draft.allowedSymbols ?? [];
    setDraft({
      ...draft,
      allowedSymbols: current.includes(sym)
        ? current.filter((s) => s !== sym)
        : [...current, sym],
    });
  };

  if (!draft) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-gray-400 dark:text-slate-500">
        Loading settings…
      </div>
    );
  }

  const isDirty = JSON.stringify(draft) !== JSON.stringify(settingsQuery.data);

  return (
    <div className="max-w-2xl space-y-5">
      {/* Risk controls */}
      <Card
        title="Risk Controls"
        eyebrow="Capital Protection"
        description="These limits are enforced before each signal is dispatched to your EA."
      >
        <div className="space-y-5">
          {/* Risk % */}
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
              onChange={(e) => setDraft({ ...draft, riskPercent: parseFloat(e.target.value) })}
              className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-gray-200 dark:bg-slate-700 accent-blue-600"
            />
            <div className="flex justify-between text-xs text-gray-400 dark:text-slate-600">
              <span>0.1%</span>
              <span>10%</span>
            </div>
          </div>

          {/* Max trades */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-gray-700 dark:text-slate-300">
                Max concurrent trades
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
              aria-label="Maximum concurrent trades"
              onChange={(e) => setDraft({ ...draft, maxTrades: parseInt(e.target.value, 10) })}
              className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-gray-200 dark:bg-slate-700 accent-blue-600"
            />
            <div className="flex justify-between text-xs text-gray-400 dark:text-slate-600">
              <span>1</span>
              <span>20</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Sessions */}
      <Card
        title="Trading Sessions"
        eyebrow="Time Filters"
        description="Only process signals that arrive during enabled sessions."
      >
        <div className="space-y-2">
          <Toggle
            label="London Session"
            description="08:00 – 17:00 GMT"
            checked={draft.sessions?.london ?? false}
            onCheckedChange={(v) =>
              setDraft({ ...draft, sessions: { ...draft.sessions, london: v } })
            }
          />
          <Toggle
            label="New York Session"
            description="13:00 – 22:00 GMT"
            checked={draft.sessions?.newYork ?? false}
            onCheckedChange={(v) =>
              setDraft({ ...draft, sessions: { ...draft.sessions, newYork: v } })
            }
          />
        </div>
      </Card>

      {/* Allowed symbols */}
      <Card
        title="Allowed Symbols"
        eyebrow="Instrument Filter"
        description="Signals for symbols not on this list will be rejected."
      >
        <div className="flex flex-wrap gap-2">
          {SYMBOLS.map((sym) => {
            const active = draft.allowedSymbols?.includes(sym) ?? false;
            return (
              <button
                key={sym}
                type="button"
                onClick={() => toggleSymbol(sym)}
                className={[
                  'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                  active
                    ? 'border-blue-300 dark:border-blue-500/40 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400'
                    : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-500 dark:text-slate-400 hover:border-gray-300 dark:hover:border-slate-600',
                ].join(' ')}
              >
                {sym}
              </button>
            );
          })}
        </div>
      </Card>

      {/* Save bar */}
      <div className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-slate-400">
          {isDirty ? (
            <>
              <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
              Unsaved changes
            </>
          ) : saved ? (
            <>
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Saved
            </>
          ) : (
            'No changes'
          )}
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
