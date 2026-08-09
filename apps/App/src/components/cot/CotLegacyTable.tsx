import type { CotCellDTO, CotTableDTO } from '@tradepilot/shared';

import { CotChangeChip } from './CotChangeChip';
import { findCategory, formatContracts, formatPercent, formatSigned } from './cotFormat';

interface CotLegacyTableProps {
  table: CotTableDTO;
  contractUnit: string;
  openInterest: number;
  openInterestChange: number;
  totalTraders: number | null;
  previousDate: string;
}

const GROUPS = [
  { label: 'Non-Commercial', sides: ['Long', 'Short', 'Spreading'] },
  { label: 'Commercial', sides: ['Long', 'Short'] },
  { label: 'Total', sides: ['Long', 'Short'] },
  { label: 'Non-Reportable', sides: ['Long', 'Short'] },
];

function SectionRow({ label, note }: { label: string; note?: string }) {
  return (
    <tr className="bg-surface-inset border-line-subtle border-y">
      <td colSpan={9} className="px-5 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-content-secondary text-xs font-medium">{label}</span>
          {note ? <span className="text-content-tertiary text-xs">{note}</span> : null}
        </div>
      </td>
    </tr>
  );
}

export function CotLegacyTable({
  table,
  contractUnit,
  openInterest,
  openInterestChange,
  totalTraders,
  previousDate,
}: CotLegacyTableProps) {
  const nonCommercial = findCategory(table, 'non_commercial');
  const commercial = findCategory(table, 'commercial');
  const total = findCategory(table, 'total');
  const nonReportable = findCategory(table, 'non_reportable');

  const columns: Array<CotCellDTO | null> = [
    nonCommercial?.long ?? null,
    nonCommercial?.short ?? null,
    nonCommercial?.spreading ?? null,
    commercial?.long ?? null,
    commercial?.short ?? null,
    total?.long ?? null,
    total?.short ?? null,
    nonReportable?.long ?? null,
    nonReportable?.short ?? null,
  ];

  return (
    <div className="border-line bg-surface rounded-card overflow-hidden border shadow-card">
      <div className="border-line-subtle bg-surface-inset border-b px-5 py-3">
        <p className="text-content-primary text-sm font-semibold">Legacy positions</p>
        <p className="text-content-tertiary mt-0.5 text-xs">
          The same contracts regrouped: Non-Commercial is Managed Money plus Other Reportables,
          Commercial is Producers plus Swap Dealers.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-left">
          <thead>
            <tr className="border-line-subtle border-b">
              {GROUPS.map((group) => (
                <th
                  key={group.label}
                  colSpan={group.sides.length}
                  className="border-line-subtle text-content-primary border-l px-3 py-2.5 text-center text-sm font-semibold first:border-l-0"
                >
                  {group.label}
                </th>
              ))}
            </tr>
            <tr className="border-line-subtle text-content-tertiary border-b text-xs">
              {GROUPS.flatMap((group) =>
                group.sides.map((side, index) => (
                  <th
                    key={`${group.label}-${side}`}
                    className={
                      index === 0
                        ? 'border-line-subtle border-l px-3 py-2 text-center font-medium first:border-l-0'
                        : 'px-3 py-2 text-center font-medium'
                    }
                  >
                    {side}
                  </th>
                )),
              )}
            </tr>
          </thead>
          <tbody>
            <SectionRow
              label={`Contracts of ${contractUnit}`}
              note={`Open Interest: ${formatContracts(openInterest)}`}
            />
            <tr>
              {columns.map((cell, index) => (
                <td
                  key={index}
                  className="text-content-primary tabular px-3 py-3 text-center text-sm font-semibold"
                >
                  {cell ? formatContracts(cell.positions) : '—'}
                </td>
              ))}
            </tr>

            <SectionRow
              label={`Changes from ${previousDate}`}
              note={`Change in Open Interest: ${formatSigned(openInterestChange)}`}
            />
            <tr>
              {columns.map((cell, index) => (
                <td key={index} className="px-3 py-3 text-center">
                  {cell ? <CotChangeChip value={cell.change} /> : '—'}
                </td>
              ))}
            </tr>

            <SectionRow label="Percent of open interest for each category of traders" />
            <tr>
              {columns.map((cell, index) => (
                <td
                  key={index}
                  className="text-content-secondary tabular px-3 py-3 text-center text-sm"
                >
                  {cell ? formatPercent(cell.pctOi) : '—'}
                </td>
              ))}
            </tr>

            <SectionRow
              label="Number of traders in each category"
              note={totalTraders === null ? undefined : `Total Traders: ${formatContracts(totalTraders)}`}
            />
            <tr>
              {columns.map((cell, index) => (
                <td
                  key={index}
                  className="text-content-secondary tabular px-3 py-3 text-center text-sm"
                >
                  {cell?.traders ?? '—'}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
