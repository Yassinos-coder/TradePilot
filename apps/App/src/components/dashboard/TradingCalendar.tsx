import { ChevronLeft, ChevronRight } from 'lucide-react';

import type { DailyTradeSummaryItem } from '@tradepilot/shared';

import { cn, formatCurrency } from '@/lib/utils';
import { Tooltip } from '@/components/ui/Tooltip';

const DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface TradingCalendarProps {
  year: number;
  month: number;
  summaryMap: Map<string, DailyTradeSummaryItem>;
  onNavigate: (year: number, month: number) => void;
  onDayClick: (date: string) => void;
}

function calendarDays(year: number, month: number): Array<{ date: string | null; day: number | null }> {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<{ date: string | null; day: number | null }> = [];

  for (let i = 0; i < firstDay; i++) {
    cells.push({ date: null, day: null });
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const mm = String(month + 1).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    cells.push({ date: `${year}-${mm}-${dd}`, day: d });
  }

  return cells;
}

function dayLabel(date: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}

export function TradingCalendar({ year, month, summaryMap, onNavigate, onDayClick }: TradingCalendarProps) {
  const monthLabel = new Intl.DateTimeFormat(undefined, {
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, month, 1));
  const cells = calendarDays(year, month);

  function prevMonth() {
    if (month === 0) onNavigate(year - 1, 11);
    else onNavigate(year, month - 1);
  }

  function nextMonth() {
    const now = new Date();
    if (year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth())) return;
    if (month === 11) onNavigate(year + 1, 0);
    else onNavigate(year, month + 1);
  }

  const isCurrentOrFuture = (() => {
    const now = new Date();
    return year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth());
  })();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={prevMonth}
          aria-label="Previous month"
          className="text-content-tertiary hover:bg-surface-muted hover:text-content-secondary focus-visible:ring-brand cursor-pointer rounded-lg p-2 transition-colors focus-visible:ring-2 focus-visible:outline-none"
        >
          <ChevronLeft aria-hidden className="h-4 w-4" />
        </button>
        <h3 aria-live="polite" className="text-content-primary text-sm font-semibold">
          {monthLabel}
        </h3>
        <button
          type="button"
          onClick={nextMonth}
          disabled={isCurrentOrFuture}
          aria-label="Next month"
          className={cn(
            'text-content-tertiary hover:bg-surface-muted hover:text-content-secondary focus-visible:ring-brand cursor-pointer rounded-lg p-2 transition-colors focus-visible:ring-2 focus-visible:outline-none',
            isCurrentOrFuture && 'pointer-events-none opacity-30',
          )}
        >
          <ChevronRight aria-hidden className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {DAY_HEADERS.map((h) => (
          <div
            key={h}
            className="text-content-tertiary py-1 text-center text-[10px] font-semibold tracking-wider uppercase"
          >
            {h}
          </div>
        ))}

        {cells.map((cell, i) => {
          if (!cell.date || cell.day === null) {
            return <div key={i} />;
          }

          const summary = summaryMap.get(cell.date);
          const hasTrades = !!summary && summary.tradeCount > 0;
          const isProfit = hasTrades && summary.netProfit >= 0;
          const isLoss = hasTrades && summary.netProfit < 0;

          const tooltipContent = summary ? (
            <div className="space-y-1">
              <p className="font-semibold">{cell.date}</p>
              <p>{summary.tradeCount} trade{summary.tradeCount !== 1 ? 's' : ''}</p>
              <p className={summary.netProfit >= 0 ? 'text-positive' : 'text-negative'}>
                {formatCurrency(summary.netProfit)}
              </p>
              {summary.symbols.length > 0 && (
                <p className="text-content-tertiary">{summary.symbols.join(', ')}</p>
              )}
            </div>
          ) : null;

          if (!hasTrades) {
            return (
              <div
                key={cell.date}
                className="bg-surface-muted text-content-tertiary flex aspect-square w-full items-center justify-center rounded-lg p-1 text-[11px] font-medium"
              >
                {cell.day}
              </div>
            );
          }

          const dayButton = (
            <button
              type="button"
              onClick={() => onDayClick(cell.date!)}
              aria-label={`${dayLabel(cell.date)} — ${summary.tradeCount} ${
                summary.tradeCount === 1 ? 'trade' : 'trades'
              }, ${formatCurrency(summary.netProfit)}`}
              className={cn(
                'flex aspect-square w-full cursor-pointer flex-col items-center justify-center rounded-lg border p-1 transition-colors',
                'focus-visible:ring-brand focus-visible:ring-2 focus-visible:outline-none',
                isProfit &&
                  'border-positive/25 bg-positive-subtle text-positive-content hover:border-positive/50',
                isLoss &&
                  'border-negative/25 bg-negative-subtle text-negative-content hover:border-negative/50',
              )}
            >
              <span className="text-content-primary text-[11px] font-medium">{cell.day}</span>
              <span className="tabular mt-0.5 text-[9px] leading-none font-semibold">
                {summary.netProfit >= 0 ? '+' : ''}
                {summary.netProfit.toFixed(0)}
              </span>
            </button>
          );

          return (
            <Tooltip key={cell.date} content={tooltipContent}>
              {dayButton}
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}
