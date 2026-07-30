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

export function TradingCalendar({ year, month, summaryMap, onNavigate, onDayClick }: TradingCalendarProps) {
  const monthLabel = new Date(year, month, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
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
          onClick={prevMonth}
          className="rounded-lg p-2 text-content-tertiary transition-colors hover:bg-surface-muted hover:text-content-secondary"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <h3 className="text-sm font-semibold text-content-primary">{monthLabel}</h3>
        <button
          onClick={nextMonth}
          disabled={isCurrentOrFuture}
          className={cn(
            'rounded-lg p-2 text-content-tertiary transition-colors hover:bg-surface-muted hover:text-content-secondary',
            isCurrentOrFuture && 'pointer-events-none opacity-30',
          )}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {DAY_HEADERS.map((h) => (
          <div key={h} className="py-1 text-center text-[10px] font-semibold uppercase tracking-wider text-content-tertiary">
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

          const cell_ = (
            <button
              key={cell.date}
              onClick={() => summary && onDayClick(cell.date!)}
              className={cn(
                'flex aspect-square w-full flex-col items-center justify-center rounded-lg p-1 transition-all',
                hasTrades ? 'cursor-pointer' : 'cursor-default',
                isProfit && 'bg-positive hover:bg-positive',
                isLoss && 'bg-negative hover:bg-negative',
                !hasTrades && 'bg-surface-muted',
              )}
            >
              <span className="text-[11px] font-medium text-content-secondary">
                {cell.day}
              </span>
              {hasTrades && (
                <span
                  className={cn(
                    'mt-0.5 text-[9px] font-semibold leading-none',
                    isProfit ? 'text-positive' : 'text-negative',
                  )}
                >
                  {summary.netProfit >= 0 ? '+' : ''}
                  {summary.netProfit.toFixed(0)}
                </span>
              )}
            </button>
          );

          return tooltipContent ? (
            <Tooltip key={cell.date} content={tooltipContent}>
              {cell_}
            </Tooltip>
          ) : (
            <div key={cell.date}>{cell_}</div>
          );
        })}
      </div>
    </div>
  );
}
