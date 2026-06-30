import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TrendingDown, TrendingUp, Activity } from 'lucide-react';

import type { DailyTradeSummaryItem, TradeExecutionDTO } from '@tradepilot/shared';

import { apiClient } from '@/lib/api';
import { cn, formatCurrency, formatPercent, formatTimestamp } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { Pagination } from '@/components/ui/Pagination';
import { Skeleton } from '@/components/ui/Skeleton';
import { TradingCalendar } from '@/components/dashboard/TradingCalendar';
import { DayDetailDrawer } from '@/components/dashboard/DayDetailDrawer';
import { usePagination } from '@/hooks/usePagination';

type StatusFilter = 'ALL' | 'OPEN' | 'CLOSED' | 'REJECTED';

function summaryMapFromItems(items: DailyTradeSummaryItem[]): Map<string, DailyTradeSummaryItem> {
  const map = new Map<string, DailyTradeSummaryItem>();
  for (const item of items) map.set(item.date, item);
  return map;
}

function monthRange(year: number, month: number) {
  const mm = String(month + 1).padStart(2, '0');
  const lastDay = new Date(year, month + 1, 0).getDate();
  return { startDate: `${year}-${mm}-01`, endDate: `${year}-${mm}-${String(lastDay).padStart(2, '0')}` };
}

function yearRange(year: number) {
  return { startDate: `${year}-01-01`, endDate: `${year}-12-31` };
}

function WinRateRing({ value }: { value: number }) {
  const r = 26;
  const circ = 2 * Math.PI * r;
  const offset = circ - (value / 100) * circ;
  return (
    <div className="relative flex h-16 w-16 items-center justify-center">
      <svg className="-rotate-90" width={64} height={64}>
        <circle cx={32} cy={32} r={r} strokeWidth={5} className="stroke-slate-200 dark:stroke-slate-700" fill="none" />
        <circle cx={32} cy={32} r={r} strokeWidth={5} strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" className="stroke-sky-500 transition-all duration-500" fill="none" />
      </svg>
      <span className="absolute text-[11px] font-bold text-slate-900 dark:text-slate-100">{value.toFixed(0)}%</span>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ label: string; value: string }>;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 whitespace-nowrap">
        {label}
      </label>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

const STATUS_TONES: Record<string, 'positive' | 'danger' | 'info' | 'neutral' | 'warning'> = {
  OPEN: 'info',
  CLOSED: 'neutral',
  REJECTED: 'danger',
};

export function DashboardPage() {
  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [symbolFilter, setSymbolFilter] = useState('ALL');
  const [accountFilter, setAccountFilter] = useState('ALL');

  const { startDate: calStart, endDate: calEnd } = monthRange(calYear, calMonth);
  const { startDate: yearStart, endDate: yearEnd } = yearRange(now.getFullYear());
  const { startDate: monthStart, endDate: monthEnd } = monthRange(now.getFullYear(), now.getMonth());

  const overviewQuery = useQuery({
    queryKey: ['overview'],
    queryFn: apiClient.overview,
    refetchInterval: 10_000,
  });

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
    queryFn: () => apiClient.executionTrades(undefined, 1000),
    refetchInterval: 15_000,
  });

  const summaryMap = useMemo(() => summaryMapFromItems(calendarQuery.data ?? []), [calendarQuery.data]);
  const monthlyNet = useMemo(() => (monthSummaryQuery.data ?? []).reduce((s, d) => s + d.netProfit, 0), [monthSummaryQuery.data]);
  const yearlyNet = useMemo(() => (yearSummaryQuery.data ?? []).reduce((s, d) => s + d.netProfit, 0), [yearSummaryQuery.data]);

  const calItems = calendarQuery.data ?? [];
  const totalTrades = calItems.reduce((s, d) => s + d.tradeCount, 0);
  const totalWins = calItems.reduce((s, d) => s + d.wins, 0);
  const winRate = totalTrades > 0 ? (totalWins / totalTrades) * 100 : 0;
  const bestDay = calItems.length > 0 ? calItems.reduce((a, b) => (a.netProfit > b.netProfit ? a : b)) : null;
  const worstDay = calItems.length > 0 ? calItems.reduce((a, b) => (a.netProfit < b.netProfit ? a : b)) : null;
  const bestTrade = calItems.reduce((best, d) => (d.bestTrade !== null && (best === null || d.bestTrade > best) ? d.bestTrade : best), null as number | null);
  const worstTrade = calItems.reduce((worst, d) => (d.worstTrade !== null && (worst === null || d.worstTrade < worst) ? d.worstTrade : worst), null as number | null);

  const selectedSummary = selectedDate ? (summaryMap.get(selectedDate) ?? null) : null;

  const allTrades: TradeExecutionDTO[] = tradesQuery.data ?? [];

  const unrealizedPl = useMemo(() => {
    const status = overviewQuery.data?.accountStatus;
    if (!status) return null;
    return status.equity - status.balance;
  }, [overviewQuery.data]);

  const openPositions = overviewQuery.data?.accountStatus?.openPositions ?? null;

  const uniqueSymbols = useMemo(
    () => Array.from(new Set(allTrades.map((t) => t.symbol))).sort(),
    [allTrades],
  );

  const uniqueAccounts = useMemo(
    () => Array.from(new Set(allTrades.map((t) => t.accountId).filter(Boolean))).sort() as string[],
    [allTrades],
  );

  const filteredTrades = useMemo(() => {
    return allTrades.filter((t) => {
      if (statusFilter !== 'ALL' && t.status !== statusFilter) return false;
      if (symbolFilter !== 'ALL' && t.symbol !== symbolFilter) return false;
      if (accountFilter !== 'ALL' && t.accountId !== accountFilter) return false;
      return true;
    });
  }, [allTrades, statusFilter, symbolFilter, accountFilter]);

  const tradesPagination = usePagination(filteredTrades, 10);

  const symbolOptions = [{ label: 'All Symbols', value: 'ALL' }, ...uniqueSymbols.map((s) => ({ label: s, value: s }))];
  const accountOptions = [{ label: 'All Accounts', value: 'ALL' }, ...uniqueAccounts.map((a) => ({ label: a, value: a }))];
  const statusOptions: Array<{ label: string; value: string }> = [
    { label: 'All Statuses', value: 'ALL' },
    { label: 'Open', value: 'OPEN' },
    { label: 'Closed', value: 'CLOSED' },
    { label: 'Rejected', value: 'REJECTED' },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
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

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
            Unrealized P&L
          </p>
          {overviewQuery.isLoading ? (
            <Skeleton className="mt-3 h-9 w-32" />
          ) : (
            <div className="mt-3 flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                unrealizedPl === null ? 'bg-slate-50 dark:bg-slate-800' :
                unrealizedPl >= 0 ? 'bg-emerald-50 dark:bg-emerald-500/10' : 'bg-red-50 dark:bg-red-500/10'
              }`}>
                <Activity className={`h-5 w-5 ${
                  unrealizedPl === null ? 'text-slate-400' :
                  unrealizedPl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                }`} />
              </div>
              <div>
                <p className={`text-3xl font-bold tracking-tight ${
                  unrealizedPl === null ? 'text-slate-400' :
                  unrealizedPl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                }`}>
                  {unrealizedPl !== null ? formatCurrency(unrealizedPl) : '--'}
                </p>
              </div>
            </div>
          )}
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {openPositions !== null ? `${openPositions} open position${openPositions !== 1 ? 's' : ''}` : 'Awaiting account telemetry'}
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
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
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
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Daily Performance</p>
                <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2 dark:border-emerald-500/20 dark:bg-emerald-500/5">
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">Best day</p>
                  <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">{bestDay ? formatCurrency(bestDay.netProfit) : '--'}</p>
                  {bestDay && <p className="text-[10px] text-slate-400">{bestDay.date}</p>}
                </div>
                <div className="rounded-lg border border-red-100 bg-red-50/60 px-3 py-2 dark:border-red-500/20 dark:bg-red-500/5">
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">Worst day</p>
                  <p className="text-sm font-semibold text-red-600 dark:text-red-400">{worstDay ? formatCurrency(worstDay.netProfit) : '--'}</p>
                  {worstDay && <p className="text-[10px] text-slate-400">{worstDay.date}</p>}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Trade Performance</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500 dark:text-slate-400">Best trade</span>
                  <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">{bestTrade !== null ? formatCurrency(bestTrade) : '--'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500 dark:text-slate-400">Worst trade</span>
                  <span className="text-xs font-semibold text-red-600 dark:text-red-400">{worstTrade !== null ? formatCurrency(worstTrade) : '--'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500 dark:text-slate-400">Total trades</span>
                  <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">{totalTrades}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-sky-600 dark:text-sky-400">Trade History</p>
            <h2 className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
              All Trades
              {filteredTrades.length !== allTrades.length && (
                <span className="ml-2 text-xs font-normal text-slate-400">({filteredTrades.length} of {allTrades.length})</span>
              )}
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <FilterSelect label="Status" value={statusFilter} onChange={(v) => { setStatusFilter(v as StatusFilter); tradesPagination.setPage(1); }} options={statusOptions} />
            <FilterSelect label="Symbol" value={symbolFilter} onChange={(v) => { setSymbolFilter(v); tradesPagination.setPage(1); }} options={symbolOptions} />
            <FilterSelect label="Account" value={accountFilter} onChange={(v) => { setAccountFilter(v); tradesPagination.setPage(1); }} options={accountOptions} />
          </div>
        </div>

        {tradesQuery.isLoading ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : filteredTrades.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">No trades found</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {allTrades.length === 0 ? 'No trade history available yet.' : 'Try adjusting the filters above.'}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-slate-100 text-xs uppercase tracking-[0.22em] text-slate-400 dark:border-slate-800 dark:text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Symbol</th>
                    <th className="px-5 py-3 font-semibold">Side</th>
                    <th className="px-5 py-3 font-semibold">Volume</th>
                    <th className="px-5 py-3 font-semibold">Entry</th>
                    <th className="px-5 py-3 font-semibold">Exit</th>
                    <th className="px-5 py-3 font-semibold">P&L</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 font-semibold">Account</th>
                    <th className="px-5 py-3 font-semibold">Opened</th>
                    <th className="px-5 py-3 font-semibold">Closed</th>
                  </tr>
                </thead>
                <tbody>
                  {tradesPagination.pageItems.map((trade) => (
                    <tr key={trade.id} className="border-b border-slate-100 last:border-b-0 dark:border-slate-800">
                      <td className="px-5 py-3 font-semibold text-slate-900 dark:text-slate-100">
                        {trade.symbol}
                      </td>
                      <td className="px-5 py-3">
                        <span className={cn(
                          'text-xs font-semibold',
                          trade.type === 'BUY' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
                        )}>
                          {trade.type}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-slate-600 dark:text-slate-400">
                        {trade.volume?.toFixed(2) ?? '--'}
                      </td>
                      <td className="px-5 py-3 text-slate-600 dark:text-slate-400">
                        {trade.entryPrice?.toFixed(5) ?? '--'}
                      </td>
                      <td className="px-5 py-3 text-slate-600 dark:text-slate-400">
                        {trade.exitPrice?.toFixed(5) ?? '--'}
                      </td>
                      <td className="px-5 py-3">
                        <span className={cn(
                          'font-semibold',
                          trade.status === 'OPEN' ? 'text-sky-600 dark:text-sky-400' :
                          trade.profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
                        )}>
                          {trade.status === 'OPEN' ? '—' : formatCurrency(trade.profit)}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={STATUS_TONES[trade.status] ?? 'neutral'} dot>
                          {trade.status}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-500 dark:text-slate-400">
                        {trade.accountName ?? trade.accountId ?? '--'}
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-500 dark:text-slate-400">
                        {formatTimestamp(trade.openedAt)}
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-500 dark:text-slate-400">
                        {trade.closedAt ? formatTimestamp(trade.closedAt) : '--'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-5 pb-3">
              <Pagination {...tradesPagination} onPageChange={tradesPagination.setPage} />
            </div>
          </>
        )}
      </div>

      <DayDetailDrawer
        date={selectedDate}
        summary={selectedSummary}
        trades={allTrades}
        onClose={() => setSelectedDate(null)}
      />
    </div>
  );
}
