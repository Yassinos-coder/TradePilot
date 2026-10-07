import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, Crown } from 'lucide-react';
import { Link } from 'react-router-dom';

import type { DailyTradeSummaryItem, TradeExecutionDTO } from '@tradepilot/shared';

import { apiClient } from '@/lib/api';
import { formatPercent } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { TradingCalendar } from '@/components/dashboard/TradingCalendar';
import { DayDetailDrawer } from '@/components/dashboard/DayDetailDrawer';
import { PartnerOffersBanner } from '@/components/dashboard/PartnerOffersBanner';
import { DownloadEaBanner } from '@/components/dashboard/DownloadEaBanner';
import { DismissibleBanner } from '@/components/dashboard/DismissibleBanner';
import { ForexSessionsTimeline } from '@/components/dashboard/ForexSessionsTimeline';
import { ActiveSessionTile } from '@/components/dashboard/ActiveSessionTile';
import { NetValueTile } from '@/components/dashboard/NetValueTile';
import { MonthStatistics } from '@/components/dashboard/MonthStatistics';
import { TradeHistoryTable } from '@/components/dashboard/TradeHistoryTable';
import { useNow } from '@/hooks/useNow';
import { useTradeHistory } from '@/hooks/useTradeHistory';

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

function sumNet(items: DailyTradeSummaryItem[]) {
  return items.reduce((sum, day) => sum + day.netProfit, 0);
}

export function DashboardPage() {
  const now = useNow();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

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
    queryKey: ['daily-summary', 'range', monthStart, monthEnd],
    queryFn: () => apiClient.dailySummary(monthStart, monthEnd),
  });

  const yearSummaryQuery = useQuery({
    queryKey: ['daily-summary', 'range', yearStart, yearEnd],
    queryFn: () => apiClient.dailySummary(yearStart, yearEnd),
  });

  const tradesQuery = useQuery({
    queryKey: ['execution', 'trades', 'all'],
    queryFn: () => apiClient.executionTrades(undefined, 300),
    refetchInterval: 120_000,
  });

  const tradeHistory = useTradeHistory();

  const summaryMap = useMemo(() => summaryMapFromItems(calendarQuery.data ?? []), [calendarQuery.data]);
  const monthlyNet = useMemo(() => sumNet(monthSummaryQuery.data ?? []), [monthSummaryQuery.data]);
  const yearlyNet = useMemo(() => sumNet(yearSummaryQuery.data ?? []), [yearSummaryQuery.data]);

  const selectedSummary = selectedDate ? (summaryMap.get(selectedDate) ?? null) : null;
  const allTrades: TradeExecutionDTO[] = tradesQuery.data ?? [];

  const accountStatus = overviewQuery.data?.accountStatus ?? null;
  const unrealizedPl = accountStatus ? (accountStatus.floatingProfit ?? accountStatus.equity - accountStatus.balance) : null;
  const openPositions = accountStatus?.openPositions ?? null;
  const copier = overviewQuery.data?.copier;

  return (
    <div className="space-y-6">
      <DismissibleBanner storageKey="tp.dismissed.download-ea-banner">
        <DownloadEaBanner />
      </DismissibleBanner>

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
                {copier.copiesFilledToday}
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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <NetValueTile
          label="Monthly Net Total"
          value={monthlyNet}
          isLoading={monthSummaryQuery.isLoading}
          caption={now.toLocaleString('default', { month: 'long', year: 'numeric' })}
        />
        <NetValueTile
          label="Annual Net Total"
          value={yearlyNet}
          isLoading={yearSummaryQuery.isLoading}
          caption={`Year to date ${now.getFullYear()}`}
        />
        <NetValueTile
          label="Unrealized P&L"
          value={unrealizedPl}
          isLoading={overviewQuery.isLoading}
          neutralIcon={Activity}
          caption={openPositions !== null ? `${openPositions} open position${openPositions !== 1 ? 's' : ''}` : 'Awaiting account telemetry'}
        />
        <ActiveSessionTile now={now} />
      </div>

      <ForexSessionsTimeline now={now} />

      <DismissibleBanner storageKey="tp.dismissed.partner-offers-banner">
        <PartnerOffersBanner />
      </DismissibleBanner>

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

        <MonthStatistics items={calendarQuery.data ?? []} isLoading={calendarQuery.isLoading} />
      </div>

      <TradeHistoryTable
        data={tradeHistory.query.data}
        isLoading={tradeHistory.query.isLoading}
        page={tradeHistory.page}
        filters={tradeHistory.filters}
        onPageChange={tradeHistory.setPage}
        onStatusChange={tradeHistory.setStatus}
        onSymbolChange={tradeHistory.setSymbol}
        onAccountChange={tradeHistory.setAccountId}
      />

      <DayDetailDrawer
        date={selectedDate}
        summary={selectedSummary}
        trades={allTrades}
        onClose={() => setSelectedDate(null)}
      />
    </div>
  );
}
