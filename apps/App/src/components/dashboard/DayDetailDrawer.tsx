import type { DailyTradeSummaryItem, TradeExecutionDTO } from '@tradepilot/shared';

import { cn, formatCurrency, formatPercent, formatTimestamp } from '@/lib/utils';
import { Drawer } from '@/components/ui/Drawer';

interface DayDetailDrawerProps {
  date: string | null;
  summary: DailyTradeSummaryItem | null;
  trades: TradeExecutionDTO[];
  onClose: () => void;
}

function StatItem({ label, value, tone }: { label: string; value: string; tone?: 'positive' | 'negative' | 'neutral' }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-b-0 dark:border-slate-800">
      <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
      <span
        className={cn(
          'text-sm font-semibold',
          tone === 'positive' && 'text-emerald-600 dark:text-emerald-400',
          tone === 'negative' && 'text-red-600 dark:text-red-400',
          (!tone || tone === 'neutral') && 'text-slate-900 dark:text-slate-100',
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function DayDetailDrawer({ date, summary, trades, onClose }: DayDetailDrawerProps) {
  const dayTrades = date
    ? trades.filter((t) => t.closedAt?.startsWith(date))
    : [];

  const drawerTitle = date
    ? new Date(date + 'T00:00:00').toLocaleDateString('default', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : '';

  return (
    <Drawer open={!!date} onClose={onClose} title={drawerTitle}>
      {summary ? (
        <div className="space-y-6">
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Daily Statistics
            </h3>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 dark:border-slate-800 dark:bg-slate-950/60">
              <StatItem
                label="Net P&L"
                value={formatCurrency(summary.netProfit)}
                tone={summary.netProfit >= 0 ? 'positive' : 'negative'}
              />
              <StatItem label="Trades" value={String(summary.tradeCount)} />
              <StatItem
                label="Win Rate"
                value={formatPercent(summary.winRate)}
                tone={summary.winRate >= 50 ? 'positive' : 'neutral'}
              />
              <StatItem label="Wins / Losses" value={`${summary.wins} / ${summary.losses}`} />
              {summary.bestTrade !== null && (
                <StatItem
                  label="Best Trade"
                  value={formatCurrency(summary.bestTrade)}
                  tone="positive"
                />
              )}
              {summary.worstTrade !== null && (
                <StatItem
                  label="Worst Trade"
                  value={formatCurrency(summary.worstTrade)}
                  tone="negative"
                />
              )}
            </div>
          </section>

          {dayTrades.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Trade History
              </h3>
              <div className="-mx-5 overflow-x-auto">
                <table className="min-w-full text-left text-xs">
                  <thead className="border-b border-slate-100 text-[10px] uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:text-slate-500">
                    <tr>
                      <th className="px-5 py-2 font-semibold">Pair</th>
                      <th className="px-5 py-2 font-semibold">Side</th>
                      <th className="px-5 py-2 font-semibold">P&L</th>
                      <th className="px-5 py-2 font-semibold">Closed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dayTrades.map((trade) => (
                      <tr
                        key={trade.id}
                        className="border-b border-slate-100 last:border-b-0 dark:border-slate-800"
                      >
                        <td className="px-5 py-3 font-medium text-slate-900 dark:text-slate-100">
                          {trade.symbol}
                        </td>
                        <td className="px-5 py-3 text-slate-600 dark:text-slate-400">
                          {trade.type}
                        </td>
                        <td
                          className={cn(
                            'px-5 py-3 font-semibold',
                            trade.profit >= 0
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-red-600 dark:text-red-400',
                          )}
                        >
                          {formatCurrency(trade.profit)}
                        </td>
                        <td className="px-5 py-3 text-slate-500 dark:text-slate-400">
                          {trade.closedAt ? formatTimestamp(trade.closedAt) : '--'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      ) : (
        <div className="flex h-40 items-center justify-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">No trade data for this day.</p>
        </div>
      )}
    </Drawer>
  );
}
