import type { CotCategoryDTO } from '@tradepilot/shared';

import { formatContracts } from './cotFormat';

interface CotLongShortChartProps {
  categories: CotCategoryDTO[];
}

/**
 * One stacked bar per trader category, long on the bottom. Reading the split
 * across categories at a glance is the whole point, so the bars are normalised
 * to each category's own gross position rather than to open interest.
 */
export function CotLongShortChart({ categories }: CotLongShortChartProps) {
  return (
    <div className="border-line bg-surface rounded-card border p-5 shadow-card">
      <p className="text-content-primary text-center text-sm font-semibold">Long vs. Short</p>

      <div className="mt-5 flex items-end gap-3 sm:gap-5">
        {categories.map((category) => {
          const gross = category.long.positions + category.short.positions;
          const longShare = gross > 0 ? (category.long.positions / gross) * 100 : 0;

          return (
            <div key={category.key} className="flex min-w-0 flex-1 flex-col items-center gap-2">
              <div className="border-line-subtle flex h-44 w-full flex-col overflow-hidden rounded-md border">
                <div
                  className="bg-negative w-full"
                  style={{ height: `${100 - longShare}%` }}
                  title={`Short ${formatContracts(category.short.positions)}`}
                />
                <div
                  className="bg-positive w-full"
                  style={{ height: `${longShare}%` }}
                  title={`Long ${formatContracts(category.long.positions)}`}
                />
              </div>
              <p className="text-content-tertiary w-full truncate text-center text-[11px]">
                {category.label}
              </p>
            </div>
          );
        })}
      </div>

      <div className="border-line-subtle mt-4 flex items-center justify-center gap-5 border-t pt-3">
        <span className="text-content-secondary flex items-center gap-1.5 text-xs">
          <span className="bg-positive h-2.5 w-2.5 rounded-sm" />
          Long
        </span>
        <span className="text-content-secondary flex items-center gap-1.5 text-xs">
          <span className="bg-negative h-2.5 w-2.5 rounded-sm" />
          Short
        </span>
      </div>
    </div>
  );
}
