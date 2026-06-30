import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TrendingDown, TrendingUp } from 'lucide-react';

import type { DailyTradeSummaryItem } from '@tradepilot/shared';

import { apiClient } from '@/lib/api';
import { formatCurrency, formatPercent } from '@/lib/utils';
import { Skeleton } from '@/components/ui/Skeleton';
import { TradingCalendar } from '@/components/dashboard/TradingCalendar';
import { DayDetailDrawer } from '@/components/dashboard/DayDetailDrawer';

function summaryMapFromItems(items: DailyTradeSummaryItem[]): Map<string, DailyTradeSummaryItem> {
  const map = new Map<string, DailyTradeSummaryItem>();
  for (const item of items) {
    map.set(item.date, item);
  }
  return map;
}

function monthRange(year: number, month: number): { startDate: string; endDate: string } {
  const mm = String(month + 1).padStart(2, '0');
  const lastDay = new Date(year, month + 1, 0).getDate();
  return {
    startDate: `${year}-${mm}-01`,
    endDate: `${year}-${mm}-${String(lastDay).padStart(2, '0')}`,
  };
}

function yearRange(year: number): { startDate: string; endDate: string } {
  return {
    startDate: `${year}-01-01`,
    endDate: `${year}-12-31`,
  };
}

function WinRateRing({ value }: { value: number }) {
  const r = 26;
  const circ = 2 * Math.PI * r;
  const offset = circ - (value / 100) * circ;

  return (
    <div className="relative flex h-16 w-16 items-center justify-center">
      <svg className="-rotate-90" width={64} height={64}>
        <circle cx={32} cy={32} r={r} strokeWidth={5} className="stroke-slate-200 dark:stroke-slate-700" fill="none" />
        <circle
          cx={32}
          cy={32}
          r={r}
          strokeWidth={5}
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="stroke-sky-500 transition-all duration-500"
          fill="none"
        />
      </svg>
      <span className="absolute text-[11px] font-bold text-slate-900 dark:text-slate-100">
        {value.toFixed(0)}%
      </span>
    </div>
  );
}

export function DashboardPage() {
  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const { startDate: calStart, endDate: calEnd } = monthRange(calYear, calMonth);
  const { startDate: yearStart, endDate: yearEnd } = yearRange(now.getFullYear());
  const { startDate: monthStart, endDate: monthEnd } = monthRange(now.getFullYear(), now.getMonth());

  const calendarQuery = useQuery({
    queryKey: ['daily-summary', calYear, calMonth],
    queryFn: () => apiClient.dailySummary(calStart, calEnd),
  });

  const monthSummaryQuery = useQuery({
    queryKey: ['daily-summary', 'current-month'],
    queryFn: () => apiClient.dailySummary(monthStart, monthEnd),
  });

  const yearSummaryQuery = useQuery({
    queryKey: ['daily-summary', 'current-year'],
    queryFn: () => apiClient.dailySummary(yearStart, yearEnd),
  });

  const tradesQuery = useQuery({
    queryKey: ['execution', 'trades', 'all'],
    queryFn: () => apiClient.executionTrades(undefined, 500),
  });

  const summaryMap = useMemo(
    () => summaryMapFromItems(calendarQuery.data ?? []),
    [calendarQuery.data],
  );

  const monthlyNet = useMemo(
    () => (monthSummaryQuery.data ?? []).reduce((sum, d) => sum + d.netProfit, 0),
    [monthSummaryQuery.data],
  );

  const yearlyNet = useMemo(
    () => (yearSummaryQuery.data ?? []).reduce((sum, d) => sum + d.netProfit, 0),
    [yearSummaryQuery.data],
  );

  const calItems = calendarQuery.data ?? [];
  const totalTrades = calItems.reduce((s, d) => s + d.tradeCount, 0);
  const totalWins = calItems.reduce((s, d) => s + d.wins, 0);
  const winRate = totalTrades > 0 ? (totalWins / totalTrades) * 100 : 0;
  const bestDay = calItems.length > 0 ? calItems.reduce((a, b) => (a.netProfit > b.netProfit ? a : b)) : null;
  const worstDay = calItems.length > 0 ? calItems.reduce((a, b) => (a.netProfit < b.netProfit ? a : b)) : null;
  const bestTrade = calItems.reduce((best, d) => (d.bestTrade !== null && (best === null || d.bestTrade > best) ? d.bestTrade : best), null as number | null);
  const worstTrade = calItems.reduce((worst, d) => (d.worstTrade !== null && (worst === null || d.worstTrade < worst) ? d.worstTrade : worst), null as number | null);

  const selectedSummary = selectedDate ? (summaryMap.get(selectedDate) ?? null) : null;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
            Monthly Net Total
          </p>
          {monthSummaryQuery.isLoading ? (
            <Skeleton className="mt-3 h-9 w-32" />
          ) : (
            <div className="mt-3 flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${monthlyNet >= 0 ? 'bg-emerald-50 dark:bg-emerald-500/10' : 'bg-red-50 dark:bg-red-500/10'}`}>
                {monthlyNet >= 0
                  ? <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  : <TrendingDown className="h-5 w-5 text-red-600 dark:text-red-400" />}
              </div>
              <p className={`text-3xl font-bold tracking-tight ${monthlyNet >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                {formatCurrency(monthlyNet)}
              </p>
            </div>
          )}
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
            Annual Net Total
          </p>
          {yearSummaryQuery.isLoading ? (
            <Skeleton className="mt-3 h-9 w-32" />
          ) : (
            <div className="mt-3 flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${yearlyNet >= 0 ? 'bg-emerald-50 dark:bg-emerald-500/10' : 'bg-red-50 dark:bg-red-500/10'}`}>
                {yearlyNet >= 0
                  ? <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  : <TrendingDown className="h-5 w-5 text-red-600 dark:text-red-400" />}
              </div>
              <p className={`text-3xl font-bold tracking-tight ${yearlyNet >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                {formatCurrency(yearlyNet)}
              </p>
            </div>
          )}
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Year to date {now.getFullYear()}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {calendarQuery.isLoading ? (
            <Skeleton className="h-72 w-full" />
          ) : (
            <TradingCalendar
              year={calYear}
              month={calMonth}
              summaryMap={summaryMap}
              onNavigate={(y, m) => { setCalYear(y); setCalMonth(m); }}
              onDayClick={setSelectedDate}
            />
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Month Statistics
          </h3>

          {calendarQuery.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-col items-center gap-2">
                <WinRateRing value={winRate} />
                <div className="text-center">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Win Rate</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">{totalWins}W / {totalTrades - totalWins}L</p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Daily Performance
                </p>
                <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2 dark:border-emerald-500/20 dark:bg-emerald-500/5">
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">Best day</p>
                  <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                    {bestDay ? formatCurrency(bestDay.netProfit) : '--'}
                  </p>
                  {bestDay && (
                    <p className="text-[10px] text-slate-400">{bestDay.date}</p>
                  )}
                </div>
                <div className="rounded-lg border border-red-100 bg-red-50/60 px-3 py-2 dark:border-red-500/20 dark:bg-red-500/5">
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">Worst day</p>
                  <p className="text-sm font-semibold text-red-600 dark:text-red-400">
                    {worstDay ? formatCurrency(worstDay.netProfit) : '--'}
                  </p>
                  {worstDay && (
                    <p className="text-[10px] text-slate-400">{worstDay.date}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Trade Performance
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500 dark:text-slate-400">Best trade</span>
                  <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    {bestTrade !== null ? formatCurrency(bestTrade) : '--'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500 dark:text-slate-400">Worst trade</span>
                  <span className="text-xs font-semibold text-red-600 dark:text-red-400">
                    {worstTrade !== null ? formatCurrency(worstTrade) : '--'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500 dark:text-slate-400">Total trades</span>
                  <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    {totalTrades}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <DayDetailDrawer
        date={selectedDate}
        summary={selectedSummary}
        trades={tradesQuery.data ?? []}
        onClose={() => setSelectedDate(null)}
      />
    </div>
  );
}
