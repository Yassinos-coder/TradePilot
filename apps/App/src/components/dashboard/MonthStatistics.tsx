import type { DailyTradeSummaryItem } from '@tradepilot/shared';

import { formatCurrency } from '@/lib/utils';
import { Skeleton } from '@/components/ui/Skeleton';

interface MonthStatisticsProps {
  items: DailyTradeSummaryItem[];
  isLoading: boolean;
}

function WinRateRing({ value }: { value: number }) {
  const r = 26;
  const circ = 2 * Math.PI * r;
  const offset = circ - (value / 100) * circ;
  return (
    <div className="relative flex h-16 w-16 items-center justify-center">
      <svg className="-rotate-90" width={64} height={64}>
        <circle cx={32} cy={32} r={r} strokeWidth={5} className="stroke-line" fill="none" />
        <circle cx={32} cy={32} r={r} strokeWidth={5} strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" className="stroke-brand transition-[stroke-dashoffset] duration-500" fill="none" />
      </svg>
      <span className="absolute text-[11px] font-bold text-content-primary">{value.toFixed(0)}%</span>
    </div>
  );
}

export function MonthStatistics({ items, isLoading }: MonthStatisticsProps) {
  const totalTrades = items.reduce((sum, day) => sum + day.tradeCount, 0);
  const totalWins = items.reduce((sum, day) => sum + day.wins, 0);
  const winRate = totalTrades > 0 ? (totalWins / totalTrades) * 100 : 0;
  const bestDay = items.length > 0 ? items.reduce((a, b) => (a.netProfit > b.netProfit ? a : b)) : null;
  const worstDay = items.length > 0 ? items.reduce((a, b) => (a.netProfit < b.netProfit ? a : b)) : null;
  const bestTrade = items.reduce((best, day) => (day.bestTrade !== null && (best === null || day.bestTrade > best) ? day.bestTrade : best), null as number | null);
  const worstTrade = items.reduce((worst, day) => (day.worstTrade !== null && (worst === null || day.worstTrade < worst) ? day.worstTrade : worst), null as number | null);

  return (
    <div className="rounded-xl border border-line bg-surface p-5 shadow-sm">
      <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-content-tertiary">Month Statistics</h3>

      {isLoading ? (
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
  );
}
