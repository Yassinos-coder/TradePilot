import { useMemo, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

import { cn } from '@/lib/utils';
import { FOREX_SESSIONS, FOREX_TIMEZONE_OPTIONS, ForexSessionUtils } from '@/lib/forexSessions';
import type { ForexActivityLevel } from '@/interfaces/forexSessions';
import { Badge, type BadgeTone } from '@/components/ui/Badge';

interface ForexSessionsTimelineProps {
  now: Date;
}

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const ACTIVITY_TONES: Record<ForexActivityLevel, BadgeTone> = {
  High: 'positive',
  Medium: 'warning',
  Low: 'danger',
  Closed: 'neutral',
};
const GRID_STYLE = {
  backgroundImage: 'linear-gradient(to right, var(--line) 1px, transparent 1px)',
  backgroundSize: `${100 / 24}% 100%`,
};
const TIMEZONE_STORAGE_KEY = 'tp.forex-timezone';
const CHART_WIDTH = 960;
const CHART_HEIGHT = 80;

function readStoredTimezone(): string {
  try {
    const stored = localStorage.getItem(TIMEZONE_STORAGE_KEY);
    return FOREX_TIMEZONE_OPTIONS.some((option) => option.value === stored) ? (stored as string) : 'local';
  } catch {
    return 'local';
  }
}

export function ForexSessionsTimeline({ now }: ForexSessionsTimelineProps) {
  const [timezoneChoice, setTimezoneChoice] = useState(readStoredTimezone);
  const timeZone = ForexSessionUtils.resolveTimeZone(timezoneChoice);

  const changeTimezone = (value: string) => {
    setTimezoneChoice(value);
    try {
      localStorage.setItem(TIMEZONE_STORAGE_KEY, value);
    } catch {
      return;
    }
  };

  const overlaps = ForexSessionUtils.getOverlaps(now, timeZone);
  const nowPct = (ForexSessionUtils.minuteOfDay(now, timeZone) / 1440) * 100;
  const weekend = ForexSessionUtils.isWeekend(now);
  const activityLevel = ForexSessionUtils.getActivityLevel(now);

  const { linePath, areaPath } = useMemo(() => {
    const profile = ForexSessionUtils.getVolumeProfile(now, timeZone);
    const step = CHART_WIDTH / (profile.length - 1);
    const points = profile.map((value, index) => `${(index * step).toFixed(1)},${(CHART_HEIGHT - 6 - value * (CHART_HEIGHT - 14)).toFixed(1)}`);
    const line = `M${points.join(' L')}`;
    return { linePath: line, areaPath: `${line} L${CHART_WIDTH},${CHART_HEIGHT} L0,${CHART_HEIGHT} Z` };
  }, [now, timeZone]);

  return (
    <div className="rounded-xl border border-line bg-surface p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand">Forex Market Hours</p>
          <p className="mt-0.5 text-sm text-content-secondary">
            {weekend ? 'Weekend: the forex market is closed' : 'Live session overlap and liquidity'}
          </p>
        </div>
        <label className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-content-tertiary">
          Timezone
          <select
            value={timezoneChoice}
            onChange={(event) => changeTimezone(event.target.value)}
            className="focus-visible:ring-brand h-8 rounded-lg border border-line bg-surface px-2 text-xs font-normal normal-case tracking-normal text-content-secondary focus-visible:ring-2 focus-visible:outline-none"
          >
            {FOREX_TIMEZONE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex gap-3">
        <div className="w-28 shrink-0 sm:w-44">
          <div className="h-14" />
          <div className="space-y-2">
            {FOREX_SESSIONS.map((session) => {
              const status = ForexSessionUtils.getStatus(session, now);
              return (
                <div key={session.key} className="flex h-14 flex-col justify-center rounded-lg bg-surface-muted px-3">
                  <div className="flex items-center gap-1.5">
                    <span className={cn('h-2 w-2 shrink-0 rounded-full', session.barClass, !status.isOpen && 'opacity-40')} />
                    <p className="truncate text-sm font-semibold text-content-primary">{session.city}</p>
                  </div>
                  <p className="tabular truncate text-xs text-content-secondary">
                    {ForexSessionUtils.formatTime(now, session.timeZone)}
                  </p>
                  <p className={cn('truncate text-[10px] font-medium', status.isOpen ? session.textClass : 'text-content-tertiary')}>
                    {status.isOpen
                      ? `Open · closes in ${ForexSessionUtils.formatDuration(status.minutesToChange)}`
                      : weekend ? 'Closed' : `Opens in ${ForexSessionUtils.formatDuration(status.minutesToChange)}`}
                  </p>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex h-20 flex-col items-start justify-center gap-2 px-1">
            <p className="text-xs text-content-secondary">Trading volume is usually</p>
            <Badge tone={ACTIVITY_TONES[activityLevel]} dot>{activityLevel === 'Closed' ? 'Closed' : activityLevel}</Badge>
          </div>
        </div>

        <div className="relative min-w-0 flex-1">
          <div className="relative h-14">
            {HOURS.filter((hour) => hour % 2 === 0).map((hour) => (
              <span
                key={hour}
                className="tabular absolute top-8 -translate-x-1/2 text-[10px] font-semibold text-content-tertiary"
                style={{ left: `${(hour / 24) * 100}%` }}
              >
                {String(hour).padStart(2, '0')}
              </span>
            ))}
            <Sun aria-hidden className="absolute top-1 left-[37.5%] h-3 w-3 -translate-x-1/2 text-content-tertiary" />
            <Moon aria-hidden className="absolute top-1 left-[87.5%] h-3 w-3 -translate-x-1/2 text-content-tertiary" />
          </div>

          <div className="relative space-y-2">
            {overlaps.map((overlap, index) => (
              <div
                key={index}
                aria-hidden
                className="pointer-events-none absolute top-0 bottom-0 z-[1] border-x border-dashed border-brand/50 bg-brand/10"
                style={{ left: `${overlap.leftPct}%`, width: `${overlap.widthPct}%` }}
              />
            ))}
            {FOREX_SESSIONS.map((session) => {
              const status = ForexSessionUtils.getStatus(session, now);
              const segments = ForexSessionUtils.getSegments(session, now, timeZone);
              return (
                <div key={session.key} className="relative h-14 overflow-hidden rounded-lg bg-surface-muted" style={GRID_STYLE}>
                  {segments.map((segment, index) => (
                    <div
                      key={index}
                      title={`${session.label}: ${ForexSessionUtils.getViewHours(session, now, timeZone)}`}
                      className={cn(
                        'absolute top-3 bottom-3 flex items-center justify-center overflow-hidden rounded-md transition-opacity',
                        session.barClass,
                        status.isOpen ? 'opacity-100 shadow-sm' : 'opacity-35',
                      )}
                      style={{ left: `${segment.leftPct}%`, width: `${segment.widthPct}%` }}
                    >
                      {index === 0 ? (
                        <span className="truncate px-2 text-[10px] font-semibold uppercase tracking-wide text-white">
                          {session.city}
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

          <div className="mt-3 h-20 overflow-hidden rounded-lg bg-surface-muted" style={GRID_STYLE}>
            <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} preserveAspectRatio="none" className="h-full w-full" aria-hidden>
              <defs>
                <linearGradient id="forex-volume-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={areaPath} fill="url(#forex-volume-fill)" />
              <path d={linePath} fill="none" stroke="var(--brand)" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
            </svg>
          </div>

          <div
            className="pointer-events-none absolute top-0 bottom-0 z-10 w-0.5 -translate-x-1/2 bg-brand"
            style={{ left: `${nowPct}%` }}
          >
            <span className="tabular absolute top-0 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
              {ForexSessionUtils.formatTime(now, timeZone)}
            </span>
          </div>
        </div>
      </div>

      <p className="mt-3 text-[11px] text-content-tertiary">
        Times shown in {timezoneChoice === 'local' ? `your local time (${timeZone})` : timeZone}. Sessions follow local business hours and adjust for daylight saving. Shaded areas show session overlaps, usually the most liquid times.
      </p>
    </div>
  );
}
