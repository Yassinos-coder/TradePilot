import type { TradeExecutionDTO, TradePageDTO } from '@tradepilot/shared';

import { cn, formatCurrency, formatTimestamp } from '@/lib/utils';
import { TradeFormatUtils } from '@/lib/tradeFormat';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Pagination } from '@/components/ui/Pagination';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';

interface TradeHistoryTableProps {
  data: TradePageDTO | undefined;
  isLoading: boolean;
  page: number;
  filters: { status: string; symbol: string; accountId: string };
  onPageChange: (page: number) => void;
  onStatusChange: (value: string) => void;
  onSymbolChange: (value: string) => void;
  onAccountChange: (value: string) => void;
}

const STATUS_TONES: Record<string, BadgeTone> = {
  OPEN: 'info',
  CLOSED: 'neutral',
  REJECTED: 'danger',
};

const STATUS_OPTIONS = [
  { label: 'All Statuses', value: 'ALL' },
  { label: 'Open', value: 'OPEN' },
  { label: 'Closed', value: 'CLOSED' },
  { label: 'Rejected', value: 'REJECTED' },
];

const COLUMN_HEADINGS = ['Symbol', 'Side', 'Volume', 'Entry', 'Exit', 'P&L', 'Status', 'Account', 'Opened', 'Closed'];

function profitClass(trade: TradeExecutionDTO) {
  if (trade.status === 'OPEN') return 'text-brand';
  return trade.profit >= 0 ? 'text-positive' : 'text-negative';
}

function profitLabel(trade: TradeExecutionDTO) {
  return trade.status === 'OPEN' ? '—' : formatCurrency(trade.profit);
}

function sideClass(trade: TradeExecutionDTO) {
  return trade.type === 'BUY' ? 'text-positive' : 'text-negative';
}

export function TradeHistoryTable({
  data,
  isLoading,
  page,
  filters,
  onPageChange,
  onStatusChange,
  onSymbolChange,
  onAccountChange,
}: TradeHistoryTableProps) {
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageSize = data?.pageSize ?? 10;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasFilters = filters.status !== 'ALL' || filters.symbol !== 'ALL' || filters.accountId !== 'ALL';

  const symbolOptions = [{ label: 'All Symbols', value: 'ALL' }, ...(data?.symbols ?? []).map((s) => ({ label: s, value: s }))];
  const accountOptions = [{ label: 'All Accounts', value: 'ALL' }, ...(data?.accounts ?? []).map((a) => ({ label: a, value: a }))];

  return (
    <div className="rounded-xl border border-line bg-surface shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-subtle px-5 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand">Trade History</p>
          <h2 className="mt-0.5 text-sm font-semibold text-content-primary">
            All Trades
            {hasFilters && (
              <span className="ml-2 text-xs font-normal text-content-tertiary">({total} matching)</span>
            )}
          </h2>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Select compact label="Status" value={filters.status} onChange={(e) => onStatusChange(e.target.value)} options={STATUS_OPTIONS} />
          <Select compact label="Symbol" value={filters.symbol} onChange={(e) => onSymbolChange(e.target.value)} options={symbolOptions} />
          <Select compact label="Account" value={filters.accountId} onChange={(e) => onAccountChange(e.target.value)} options={accountOptions} />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2 p-5">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <p className="text-sm font-medium text-content-primary">No trades found</p>
          <p className="mt-1 text-sm text-content-tertiary">
            {!hasFilters ? 'No trade history available yet.' : 'Try adjusting the filters above.'}
          </p>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-line-subtle md:hidden">
            {items.map((trade) => (
              <li key={trade.id} className="space-y-2 px-5 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-content-primary">{trade.symbol}</span>
                    <span className={cn('text-xs font-semibold', sideClass(trade))}>{trade.type}</span>
                    <span className="text-xs text-content-secondary">{trade.volume?.toFixed(2) ?? '--'} lots</span>
                  </div>
                  <span className={cn('font-semibold', profitClass(trade))}>{profitLabel(trade)}</span>
                </div>
                <div className="flex items-center justify-between gap-2 text-xs text-content-tertiary">
                  <span className="tabular">
                    {TradeFormatUtils.formatPrice(trade.symbol, trade.entryPrice)} → {TradeFormatUtils.formatPrice(trade.symbol, trade.exitPrice)}
                  </span>
                  <Badge tone={STATUS_TONES[trade.status] ?? 'neutral'} dot>{trade.status}</Badge>
                </div>
                <p className="text-[11px] text-content-tertiary">
                  {trade.accountName ?? trade.accountId ?? '--'} · {formatTimestamp(trade.openedAt)}
                </p>
              </li>
            ))}
          </ul>

          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-line-subtle text-xs uppercase tracking-[0.22em] text-content-tertiary">
                <tr>
                  {COLUMN_HEADINGS.map((heading) => (
                    <th key={heading} className="px-5 py-3 font-semibold">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((trade) => (
                  <tr key={trade.id} className="border-b border-line-subtle last:border-b-0">
                    <td className="px-5 py-3 font-semibold text-content-primary">{trade.symbol}</td>
                    <td className="px-5 py-3">
                      <span className={cn('text-xs font-semibold', sideClass(trade))}>{trade.type}</span>
                    </td>
                    <td className="px-5 py-3 text-content-secondary">{trade.volume?.toFixed(2) ?? '--'}</td>
                    <td className="tabular px-5 py-3 text-content-secondary">{TradeFormatUtils.formatPrice(trade.symbol, trade.entryPrice)}</td>
                    <td className="tabular px-5 py-3 text-content-secondary">{TradeFormatUtils.formatPrice(trade.symbol, trade.exitPrice)}</td>
                    <td className="px-5 py-3">
                      <span className={cn('font-semibold', profitClass(trade))}>{profitLabel(trade)}</span>
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone={STATUS_TONES[trade.status] ?? 'neutral'} dot>{trade.status}</Badge>
                    </td>
                    <td className="px-5 py-3 text-xs text-content-tertiary">{trade.accountName ?? trade.accountId ?? '--'}</td>
                    <td className="px-5 py-3 text-xs text-content-tertiary">{formatTimestamp(trade.openedAt)}</td>
                    <td className="px-5 py-3 text-xs text-content-tertiary">{trade.closedAt ? formatTimestamp(trade.closedAt) : '--'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-5 pb-3">
            <Pagination
              page={page}
              totalPages={totalPages}
              totalItems={total}
              startIndex={(page - 1) * pageSize + 1}
              endIndex={Math.min(page * pageSize, total)}
              onPageChange={onPageChange}
            />
          </div>
        </>
      )}
    </div>
  );
}
