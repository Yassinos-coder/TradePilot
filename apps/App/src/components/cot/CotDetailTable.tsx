import { Fragment } from 'react';

import type { CotCellDTO, CotTableDTO } from '@tradepilot/shared';

import { cn } from '@/lib/utils';

import { CotChangeChip } from './CotChangeChip';
import { formatContracts, formatPercent } from './cotFormat';

interface CotDetailTableProps {
  table: CotTableDTO;
  /** The speculative category to tint, so the hedge-fund row reads first. */
  highlightKey: string;
}

const SIDES = ['Long', 'Short', 'Spread'] as const;

function CellGroup({ cell }: { cell: CotCellDTO | null }) {
  if (!cell) {
    return (
      <>
        <td className="border-line-subtle border-l px-3 py-3" />
        <td className="px-3 py-3" />
        <td className="px-3 py-3" />
      </>
    );
  }

  return (
    <>
      <td className="border-line-subtle border-l px-3 py-3 align-top">
        <div className="text-content-primary tabular text-sm font-semibold">
          {formatContracts(cell.positions)}
        </div>
        <CotChangeChip value={cell.change} className="mt-1" />
      </td>
      <td className="text-content-secondary tabular px-3 py-3 align-top text-sm">
        {formatPercent(cell.pctOi)}
      </td>
      <td className="text-content-secondary tabular px-3 py-3 align-top text-sm">
        {cell.traders ?? '—'}
      </td>
    </>
  );
}

export function CotDetailTable({ table, highlightKey }: CotDetailTableProps) {
  return (
    <div className="border-line bg-surface rounded-card overflow-hidden border shadow-card">
      <div className="border-line-subtle bg-surface-inset border-b px-5 py-3">
        <p className="text-content-primary text-sm font-semibold">{table.label} positions</p>
        <p className="text-content-tertiary mt-0.5 text-xs">
          Week-over-week change shown beneath each position.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-left">
          <thead>
            <tr className="border-line-subtle border-b">
              <th className="px-5 py-2.5" />
              {SIDES.map((side) => (
                <th
                  key={side}
                  colSpan={3}
                  className="border-line-subtle text-content-primary border-l px-3 py-2.5 text-center text-sm font-semibold"
                >
                  {side}
                </th>
              ))}
            </tr>
            <tr className="border-line-subtle text-content-tertiary border-b text-xs">
              <th className="px-5 py-2 font-medium">Trader category</th>
              {SIDES.map((side) => (
                <Fragment key={side}>
                  <th className="border-line-subtle border-l px-3 py-2 font-medium">Positions</th>
                  <th className="px-3 py-2 font-medium">Open Int</th>
                  <th className="px-3 py-2 font-medium"># Traders</th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.categories.map((category, index) => (
              <tr
                key={category.key}
                className={cn(
                  'border-line-subtle border-b last:border-0',
                  category.key === highlightKey
                    ? 'bg-brand-subtle'
                    : index % 2 === 1
                      ? 'bg-surface-inset'
                      : undefined,
                )}
              >
                <th
                  scope="row"
                  className="text-content-primary max-w-[220px] px-5 py-3 align-top text-sm font-semibold"
                >
                  {category.label}
                </th>
                <CellGroup cell={category.long} />
                <CellGroup cell={category.short} />
                <CellGroup cell={category.spreading} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
