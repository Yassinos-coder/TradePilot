import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, RefreshCw } from 'lucide-react';

import type { EconomicEventDTO, NewsImpact, NewsRange } from '@tradepilot/shared';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Skeleton } from '@/components/ui/Skeleton';
import { apiClient } from '@/lib/api';
import { cn } from '@/lib/utils';

const RANGES = [
  { key: 'lastweek' as const, label: 'Last week' },
  { key: 'thisweek' as const, label: 'This week' },
  { key: 'nextweek' as const, label: 'Next week' },
];

const IMPACTS: Array<{ value: NewsImpact; label: string; dot: string; text: string }> = [
  { value: 'HIGH', label: 'High', dot: 'bg-negative', text: 'text-negative-content' },
  { value: 'MEDIUM', label: 'Medium', dot: 'bg-warning', text: 'text-warning-content' },
  { value: 'LOW', label: 'Low', dot: 'bg-positive', text: 'text-positive-content' },
  { value: 'HOLIDAY', label: 'Non-economic', dot: 'bg-content-tertiary', text: 'text-content-tertiary' },
];

const IMPACT_META = new Map(IMPACTS.map((impact) => [impact.value, impact]));

/** Majors first — the pairs most people actually trade. */
const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD', 'CNY'];

function dayKey(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function timeLabel(event: EconomicEventDTO) {
  if (event.allDay) {
    return 'All day';
  }

  return new Date(event.date).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function isToday(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

export function NewsCalendarPage() {
  const [range, setRange] = useState<NewsRange>('thisweek');
  const [impacts, setImpacts] = useState<Set<NewsImpact>>(new Set(['HIGH', 'MEDIUM']));
  const [currencies, setCurrencies] = useState<Set<string>>(new Set());

  const calendarQuery = useQuery({
    queryKey: ['news', 'calendar', range],
    queryFn: () => apiClient.newsCalendar(range),
    staleTime: 5 * 60_000,
  });

  const grouped = useMemo(() => {
    const events = (calendarQuery.data?.events ?? []).filter((event) => {
      if (impacts.size > 0 && !impacts.has(event.impact)) {
        return false;
      }
      if (currencies.size > 0 && !currencies.has(event.currency)) {
        return false;
      }
      return true;
    });

    const byDay = new Map<string, EconomicEventDTO[]>();

    for (const event of events) {
      const key = dayKey(event.date);
      const bucket = byDay.get(key) ?? [];
      bucket.push(event);
      byDay.set(key, bucket);
    }

    return [...byDay.entries()];
  }, [calendarQuery.data, impacts, currencies]);

  const toggle = <T,>(set: Set<T>, value: T, apply: (next: Set<T>) => void) => {
    const next = new Set(set);
    if (next.has(value)) {
      next.delete(value);
    } else {
      next.add(value);
    }
    apply(next);
  };

  return (
    <div className="space-y-5">
      <div className="border-line bg-surface rounded-card space-y-4 border p-4 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SegmentedControl
            items={RANGES}
            value={range}
            onChange={setRange}
            className="max-w-md"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => void calendarQuery.refetch()}
            isLoading={calendarQuery.isFetching}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-content-tertiary mr-1 text-xs font-medium">Impact</span>
            {IMPACTS.map((impact) => {
              const active = impacts.has(impact.value);
              return (
                <button
                  key={impact.value}
                  type="button"
                  onClick={() => toggle(impacts, impact.value, setImpacts)}
                  className={cn(
                    'inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                    active
                      ? 'border-brand bg-brand-subtle text-content-primary'
                      : 'border-line text-content-tertiary hover:bg-surface-muted',
                  )}
                >
                  <span className={cn('h-1.5 w-1.5 rounded-full', impact.dot)} />
                  {impact.label}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-content-tertiary mr-1 text-xs font-medium">Currency</span>
            {CURRENCIES.map((currency) => {
              const active = currencies.has(currency);
              return (
                <button
                  key={currency}
                  type="button"
                  onClick={() => toggle(currencies, currency, setCurrencies)}
                  className={cn(
                    'cursor-pointer rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                    active
                      ? 'border-brand bg-brand-subtle text-content-primary'
                      : 'border-line text-content-tertiary hover:bg-surface-muted',
                  )}
                >
                  {currency}
                </button>
              );
            })}
            {currencies.size > 0 ? (
              <button
                type="button"
                onClick={() => setCurrencies(new Set())}
                className="text-content-tertiary hover:text-content-primary cursor-pointer text-xs underline"
              >
                Clear
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {calendarQuery.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-32 w-full" />
          ))}
        </div>
      ) : calendarQuery.isError ? (
        <Alert tone="danger" title="Could not load the calendar">
          The economic calendar feed is unreachable right now. Try refreshing in a minute.
        </Alert>
      ) : grouped.length === 0 ? (
        <div className="border-line bg-surface rounded-card border border-dashed p-10 text-center">
          <CalendarDays className="text-content-tertiary mx-auto h-6 w-6" />
          <p className="text-content-secondary mt-2 text-sm">
            No events match these filters for this week.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([day, events]) => (
            <div
              key={day}
              className="border-line bg-surface rounded-card overflow-hidden border shadow-card"
            >
              <div
                className={cn(
                  'border-line-subtle border-b px-5 py-3',
                  isToday(events[0]!.date) ? 'bg-brand-subtle' : 'bg-surface-inset',
                )}
              >
                <p className="text-content-primary text-sm font-semibold">
                  {day}
                  {isToday(events[0]!.date) ? (
                    <span className="text-brand ml-2 text-xs font-medium">Today</span>
                  ) : null}
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="border-line-subtle text-content-tertiary border-b text-xs">
                    <tr>
                      <th className="w-24 px-5 py-2.5 font-medium">Time</th>
                      <th className="w-20 px-3 py-2.5 font-medium">Currency</th>
                      <th className="w-24 px-3 py-2.5 font-medium">Impact</th>
                      <th className="px-3 py-2.5 font-medium">Event</th>
                      <th className="w-24 px-3 py-2.5 text-right font-medium">Actual</th>
                      <th className="w-24 px-3 py-2.5 text-right font-medium">Forecast</th>
                      <th className="w-24 px-5 py-2.5 text-right font-medium">Previous</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((event) => {
                      const impact = IMPACT_META.get(event.impact);

                      return (
                        <tr key={event.id} className="border-line-subtle border-b last:border-0">
                          <td className="text-content-tertiary tabular px-5 py-2.5 text-xs">
                            {timeLabel(event)}
                          </td>
                          <td className="text-content-primary px-3 py-2.5 text-xs font-semibold">
                            {event.currency}
                          </td>
                          <td className="px-3 py-2.5">
                            <span
                              className={cn(
                                'inline-flex items-center gap-1.5 text-xs font-medium',
                                impact?.text,
                              )}
                            >
                              <span className={cn('h-2 w-2 rounded-full', impact?.dot)} />
                              {impact?.label}
                            </span>
                          </td>
                          <td className="text-content-primary px-3 py-2.5">{event.title}</td>
                          <td
                            className={cn(
                              'tabular px-3 py-2.5 text-right text-xs font-semibold',
                              event.actual ? 'text-content-primary' : 'text-content-tertiary',
                            )}
                          >
                            {event.actual ?? '—'}
                          </td>
                          <td className="text-content-secondary tabular px-3 py-2.5 text-right text-xs">
                            {event.forecast ?? '—'}
                          </td>
                          <td className="text-content-secondary tabular px-5 py-2.5 text-right text-xs">
                            {event.previous ?? '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-content-tertiary text-xs">
        Times shown in your local timezone. Data from the Forex Factory public calendar feed,
        cached for 10 minutes.
      </p>
    </div>
  );
}
