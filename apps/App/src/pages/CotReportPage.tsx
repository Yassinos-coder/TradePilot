import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';

import type { CotReportMode } from '@tradepilot/shared';

import { CotCategoryHistoryChart } from '@/components/cot/CotCategoryHistoryChart';
import { CotAiAnalysis } from '@/components/cot/CotAiAnalysis';
import { CotDetailTable } from '@/components/cot/CotDetailTable';
import { CotIndexTiles } from '@/components/cot/CotIndexTiles';
import { CotLegacyTable } from '@/components/cot/CotLegacyTable';
import { CotLongShortChart } from '@/components/cot/CotLongShortChart';
import { CotMarketPicker } from '@/components/cot/CotMarketPicker';
import { CotNetPositionChart } from '@/components/cot/CotNetPositionChart';
import { CotReportHeader } from '@/components/cot/CotReportHeader';
import { CotSpeculatorSummary } from '@/components/cot/CotSpeculatorSummary';
import { formatReportDate } from '@/components/cot/cotFormat';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Skeleton } from '@/components/ui/Skeleton';
import { apiClient } from '@/lib/api';

/** Gold is the contract most of this audience reads the COT for. */
const DEFAULT_MARKET_CODE = '088691';
const DEFAULT_GROUP = 'Metals';

const MODES = [
  { key: 'futures' as const, label: 'Futures only' },
  { key: 'combined' as const, label: 'Futures + options' },
];

const SPECULATOR_KEYS: Record<string, string> = {
  disaggregated: 'managed_money',
  financial: 'leveraged_funds',
};

export function CotReportPage() {
  const [code, setCode] = useState(DEFAULT_MARKET_CODE);
  const [group, setGroup] = useState(DEFAULT_GROUP);
  const [mode, setMode] = useState<CotReportMode>('futures');

  const marketsQuery = useQuery({
    queryKey: ['cot', 'markets'],
    queryFn: apiClient.cotMarkets,
    staleTime: Infinity,
  });

  const reportQuery = useQuery({
    queryKey: ['cot', 'report', code, mode],
    queryFn: () => apiClient.cotReport(code, mode),
    staleTime: 30 * 60_000,
  });

  // History is backfilled from the CFTC archive on first visit, so it is fetched
  // separately and allowed to arrive after the current week's tables.
  const historyQuery = useQuery({
    queryKey: ['cot', 'history', code, mode],
    queryFn: () => apiClient.cotHistory(code, mode),
    staleTime: 60 * 60_000,
  });

  const analysisQuery = useQuery({
    queryKey: ['cot', 'analysis', code, mode],
    queryFn: () => apiClient.cotAnalysis(code, mode),
    // Avoid racing the first historical backfill with an identical request from
    // the analysis endpoint. Once both datasets exist, Claude can read them.
    enabled: reportQuery.isSuccess && historyQuery.isSuccess,
    staleTime: 6 * 60 * 60_000,
    retry: 1,
  });

  const markets = marketsQuery.data?.markets ?? [];
  const report = reportQuery.data;
  const history = historyQuery.data;

  const legacyTable = report?.tables.find((table) => table.kind === 'legacy');
  const detailTable = report?.tables.find((table) => table.kind !== 'legacy');

  const refreshCot = async () => {
    await Promise.all([reportQuery.refetch(), historyQuery.refetch()]);
    await analysisQuery.refetch();
  };

  const changeGroup = (next: string) => {
    setGroup(next);

    const first = markets.find((market) => market.group === next);

    if (first) {
      setCode(first.code);
    }
  };

  return (
    <div className="space-y-5">
      <div className="border-line bg-surface rounded-card space-y-4 border p-4 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SegmentedControl items={MODES} value={mode} onChange={setMode} className="max-w-sm" />
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refreshCot()}
            isLoading={
              reportQuery.isFetching || historyQuery.isFetching || analysisQuery.isFetching
            }
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>

        {markets.length > 0 ? (
          <CotMarketPicker
            markets={markets}
            value={code}
            group={group}
            onChange={setCode}
            onGroupChange={changeGroup}
          />
        ) : (
          <Skeleton className="h-16 w-full" />
        )}
      </div>

      {reportQuery.isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      ) : reportQuery.isError || !report || !legacyTable || !detailTable ? (
        <Alert tone="danger" title="Could not load the Commitments of Traders report">
          The CFTC release is unreachable right now. Try refreshing in a minute.
        </Alert>
      ) : (
        <>
          <CotReportHeader report={report} />

          <CotSpeculatorSummary speculators={report.speculators} />

          {analysisQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-32 w-full" />
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <Skeleton className="h-48 w-full" />
                <Skeleton className="h-48 w-full" />
                <Skeleton className="h-48 w-full" />
              </div>
            </div>
          ) : analysisQuery.isError ? (
            <Alert tone="warning" title="AI interpretation is unavailable">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span>
                  The COT tables remain available. Claude could not generate the positioning cards
                  right now.
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void analysisQuery.refetch()}
                  isLoading={analysisQuery.isFetching}
                >
                  Retry AI
                </Button>
              </div>
            </Alert>
          ) : analysisQuery.data ? (
            <CotAiAnalysis analysis={analysisQuery.data} />
          ) : null}

          {historyQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-72 w-full" />
            </div>
          ) : historyQuery.isError ? (
            <Alert tone="warning" title="History is unavailable">
              The current week is shown above. The CFTC historical archive could not be reached, so
              the COT Index and net-position chart are missing.
            </Alert>
          ) : history ? (
            <>
              <CotIndexTiles indexes={history.indexes} speculatorLabel={history.speculatorLabel} />
              <CotNetPositionChart
                points={history.points}
                speculatorLabel={history.speculatorLabel}
              />
              <CotCategoryHistoryChart points={history.points} />
            </>
          ) : null}

          <CotDetailTable
            table={detailTable}
            highlightKey={SPECULATOR_KEYS[detailTable.kind] ?? ''}
          />

          <CotLongShortChart categories={detailTable.categories} />

          <CotLegacyTable
            table={legacyTable}
            contractUnit={report.market.contractUnit}
            openInterest={report.openInterest}
            openInterestChange={report.openInterestChange}
            totalTraders={report.totalTraders}
            previousDate={formatReportDate(report.previousDate)}
          />

          <p className="text-content-tertiary text-xs">
            Source: CFTC Commitments of Traders, published Fridays at 15:30 ET for the preceding
            Tuesday. Positions as of {formatReportDate(report.reportDate)}, compared with{' '}
            {formatReportDate(report.previousDate)}.
          </p>
        </>
      )}
    </div>
  );
}
