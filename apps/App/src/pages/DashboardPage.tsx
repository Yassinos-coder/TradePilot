import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, Crown, TrendingDown, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';

import type { DailyTradeSummaryItem, TradeExecutionDTO } from '@tradepilot/shared';

import { apiClient } from '@/lib/api';
import { cn, formatCurrency, formatPercent, formatTimestamp } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { Pagination } from '@/components/ui/Pagination';
import { Skeleton } from '@/components/ui/Skeleton';
import { TradingCalendar } from '@/components/dashboard/TradingCalendar';
import { DayDetailDrawer } from '@/components/dashboard/DayDetailDrawer';
import { PartnerOffersBanner } from '@/components/dashboard/PartnerOffersBanner';
import { DownloadEaBanner } from '@/components/dashboard/DownloadEaBanner';
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
        <circle cx={32} cy={32} r={r} strokeWidth={5} className="stroke-line" fill="none" />
        <circle cx={32} cy={32} r={r} strokeWidth={5} strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" className="stroke-brand transition-all duration-500" fill="none" />
      </svg>
      <span className="absolute text-[11px] font-bold text-content-primary">{value.toFixed(0)}%</span>
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
      <label className="text-[11px] font-semibold uppercase tracking-wider text-content-tertiary whitespace-nowrap">
        {label}
      </label>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 rounded-lg border border-line bg-surface px-2 text-xs text-content-secondary outline-none"
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
    refetchInterval: 60_000,
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
    queryFn: () => apiClient.executionTrades(undefined, 300),
    refetchInterval: 120_000,
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

  const copier = overviewQuery.data?.copier;

  return (
    <div className="space-y-6">
      <DownloadEaBanner />

      {copier ? (
        <Link
          to="/app/copier"
          className="rounded-card border-line bg-surface hover:border-brand/40 block border p-4 shadow-card transition-colors"
        >
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
            <div className="min-w-0">
              <p className="text-content-tertiary text-xs font-medium">Copier</p>
              <div className="mt-1 flex items-center gap-2">
                <Crown className="text-brand h-4 w-4 shrink-0" />
                <span className="text-content-primary truncate text-sm font-semibold">
                  {copier.masterAccountName ?? 'No master set'}
                </span>
                <Badge tone={copier.masterOnline ? 'positive' : 'neutral'} dot pulse={copier.masterOnline}>
                  {copier.masterOnline ? 'Online' : 'Offline'}
                </Badge>
              </div>
            </div>
            <div>
              <p className="text-content-tertiary text-xs font-medium">Slaves online</p>
              <p className="text-content-primary tabular mt-1 text-sm font-semibold">
                {copier.slavesOnline} / {copier.totalLinks}
              </p>
            </div>
            <div>
              <p className="text-content-tertiary text-xs font-medium">Copies today</p>
              <p className="text-content-primary tabular mt-1 text-sm font-semibold">
                {copier.copyEventsToday}
              </p>
            </div>
            <div>
              <p className="text-content-tertiary text-xs font-medium">Success rate</p>
              <p className="text-content-primary tabular mt-1 text-sm font-semibold">
                {copier.copySuccessRate === null ? '--' : formatPercent(copier.copySuccessRate)}
              </p>
            </div>
            {copier.copiesSkippedToday > 0 ? (
              <Badge tone="warning">{copier.copiesSkippedToday} skipped today</Badge>
            ) : null}
            {copier.copiesFailedToday > 0 ? (
              <Badge tone="danger">{copier.copiesFailedToday} failed today</Badge>
            ) : null}
          </div>
        </Link>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-content-tertiary">
            Monthly Net Total
          </p>
          {monthSummaryQuery.isLoading ? (
            <Skeleton className="mt-3 h-9 w-32" />
          ) : (
            <div className="mt-3 flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${monthlyNet >= 0 ? 'bg-positive-subtle' : 'bg-negative-subtle'}`}>
                {monthlyNet >= 0
                  ? <TrendingUp className="h-5 w-5 text-positive" />
                  : <TrendingDown className="h-5 w-5 text-negative" />}
              </div>
              <p className={`text-3xl font-bold tracking-tight ${monthlyNet >= 0 ? 'text-positive' : 'text-negative'}`}>
                {formatCurrency(monthlyNet)}
              </p>
            </div>
          )}
          <p className="mt-2 text-xs text-content-tertiary">
            {new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}
          </p>
        </div>

        <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-content-tertiary">
            Annual Net Total
          </p>
          {yearSummaryQuery.isLoading ? (
            <Skeleton className="mt-3 h-9 w-32" />
          ) : (
            <div className="mt-3 flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${yearlyNet >= 0 ? 'bg-positive-subtle' : 'bg-negative-subtle'}`}>
                {yearlyNet >= 0
                  ? <TrendingUp className="h-5 w-5 text-positive" />
                  : <TrendingDown className="h-5 w-5 text-negative" />}
              </div>
              <p className={`text-3xl font-bold tracking-tight ${yearlyNet >= 0 ? 'text-positive' : 'text-negative'}`}>
                {formatCurrency(yearlyNet)}
              </p>
            </div>
          )}
          <p className="mt-2 text-xs text-content-tertiary">
            Year to date {now.getFullYear()}
          </p>
        </div>

        <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-content-tertiary">
            Unrealized P&L
          </p>
          {overviewQuery.isLoading ? (
            <Skeleton className="mt-3 h-9 w-32" />
          ) : (
            <div className="mt-3 flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${
unrealizedPl === null ? 'bg-surface-muted' :
                unrealizedPl >= 0 ? 'bg-positive-subtle' : 'bg-negative-subtle'
              }`}>
                <Activity className={`h-5 w-5 ${
unrealizedPl === null ? 'text-content-tertiary' :
                  unrealizedPl >= 0 ? 'text-positive' : 'text-negative'
                }`} />
              </div>
              <div>
                <p className={`text-3xl font-bold tracking-tight ${
unrealizedPl === null ? 'text-content-tertiary' :
                  unrealizedPl >= 0 ? 'text-positive' : 'text-negative'
                }`}>
                  {unrealizedPl !== null ? formatCurrency(unrealizedPl) : '--'}
                </p>
              </div>
            </div>
          )}
          <p className="mt-2 text-xs text-content-tertiary">
            {openPositions !== null ? `${openPositions} open position${openPositions !== 1 ? 's' : ''}` : 'Awaiting account telemetry'}
          </p>
        </div>
      </div>

      <PartnerOffersBanner />

      <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
        <div className="rounded-xl border border-line bg-surface p-5 shadow-sm">
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

        <div className="rounded-xl border border-line bg-surface p-5 shadow-sm">
          <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-content-tertiary">
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
                  <p className="text-xs font-medium text-content-tertiary">Win Rate</p>
                  <p className="text-xs text-content-tertiary">{totalWins}W / {totalTrades - totalWins}L</p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-content-tertiary">Daily Performance</p>
                <div className="rounded-lg border border-positive-subtle bg-positive-subtle px-3 py-2">
                  <p className="text-[10px] text-content-tertiary">Best day</p>
                  <p className="text-sm font-semibold text-positive">{bestDay ? formatCurrency(bestDay.netProfit) : '--'}</p>
                  {bestDay && <p className="text-[10px] text-content-tertiary">{bestDay.date}</p>}
                </div>
                <div className="rounded-lg border border-negative-subtle bg-negative-subtle px-3 py-2">
                  <p className="text-[10px] text-content-tertiary">Worst day</p>
                  <p className="text-sm font-semibold text-negative">{worstDay ? formatCurrency(worstDay.netProfit) : '--'}</p>
                  {worstDay && <p className="text-[10px] text-content-tertiary">{worstDay.date}</p>}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-content-tertiary">Trade Performance</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-content-tertiary">Best trade</span>
                  <span className="text-xs font-semibold text-positive">{bestTrade !== null ? formatCurrency(bestTrade) : '--'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-content-tertiary">Worst trade</span>
                  <span className="text-xs font-semibold text-negative">{worstTrade !== null ? formatCurrency(worstTrade) : '--'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-content-tertiary">Total trades</span>
                  <span className="text-xs font-semibold text-content-primary">{totalTrades}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-line bg-surface shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-subtle px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-brand">Trade History</p>
            <h2 className="mt-0.5 text-sm font-semibold text-content-primary">
              All Trades
              {filteredTrades.length !== allTrades.length && (
                <span className="ml-2 text-xs font-normal text-content-tertiary">({filteredTrades.length} of {allTrades.length})</span>
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
            <p className="text-sm font-medium text-content-primary">No trades found</p>
            <p className="mt-1 text-sm text-content-tertiary">
              {allTrades.length === 0 ? 'No trade history available yet.' : 'Try adjusting the filters above.'}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-line-subtle text-xs uppercase tracking-[0.22em] text-content-tertiary">
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
                    <tr key={trade.id} className="border-b border-line-subtle last:border-b-0">
                      <td className="px-5 py-3 font-semibold text-content-primary">
                        {trade.symbol}
                      </td>
                      <td className="px-5 py-3">
                        <span className={cn(
                          'text-xs font-semibold',
                          trade.type === 'BUY' ? 'text-positive' : 'text-negative',
                        )}>
                          {trade.type}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-content-secondary">
                        {trade.volume?.toFixed(2) ?? '--'}
                      </td>
                      <td className="px-5 py-3 text-content-secondary">
                        {trade.entryPrice?.toFixed(5) ?? '--'}
                      </td>
                      <td className="px-5 py-3 text-content-secondary">
                        {trade.exitPrice?.toFixed(5) ?? '--'}
                      </td>
                      <td className="px-5 py-3">
                        <span className={cn(
                          'font-semibold',
                          trade.status === 'OPEN' ? 'text-brand' :
                          trade.profit >= 0 ? 'text-positive' : 'text-negative',
                        )}>
                          {trade.status === 'OPEN' ? '—' : formatCurrency(trade.profit)}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={STATUS_TONES[trade.status] ?? 'neutral'} dot>
                          {trade.status}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-xs text-content-tertiary">
                        {trade.accountName ?? trade.accountId ?? '--'}
                      </td>
                      <td className="px-5 py-3 text-xs text-content-tertiary">
                        {formatTimestamp(trade.openedAt)}
                      </td>
                      <td className="px-5 py-3 text-xs text-content-tertiary">
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
