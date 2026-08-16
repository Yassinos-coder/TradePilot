import type { CotIndexWindowDTO } from '@tradepilot/shared';

import { cn } from '@/lib/utils';

import { formatSigned } from './cotFormat';

interface CotIndexTilesProps {
  indexes: CotIndexWindowDTO[];
  speculatorLabel: string;
}

/** Past these, positioning sits at the edge of its own historical range. */
const HIGH_EXTREME = 80;
const LOW_EXTREME = 20;

function toneFor(value: number | null) {
  if (value === null) {
    return { bar: 'bg-content-tertiary', text: 'text-content-secondary' };
  }

  if (value >= HIGH_EXTREME) {
    return { bar: 'bg-positive', text: 'text-positive-content' };
  }

  if (value <= LOW_EXTREME) {
    return { bar: 'bg-negative', text: 'text-negative-content' };
  }

  return { bar: 'bg-brand', text: 'text-content-primary' };
}

function noteFor(index: CotIndexWindowDTO) {
  if (index.value === null) {
    return 'Not enough history to rank.';
  }

  if (index.sampleWeeks < index.weeks) {
    return `Only ${index.sampleWeeks} weeks on record.`;
  }

  if (index.value >= HIGH_EXTREME) {
    return 'Near the top of its range — stretched long.';
  }

  if (index.value <= LOW_EXTREME) {
    return 'Near the bottom of its range — stretched short.';
  }

  return 'Mid-range positioning.';
}

export function CotIndexTiles({ indexes, speculatorLabel }: CotIndexTilesProps) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-content-primary text-sm font-semibold">COT Index</h3>
        <p className="text-content-tertiary mt-0.5 text-xs">
          Where {speculatorLabel}&rsquo;s net position sits inside its own range over each lookback —
          0 is the most short that window has seen, 100 the most long.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {indexes.map((index) => {
          const tone = toneFor(index.value);

          return (
            <div
              key={index.weeks}
              className="border-line bg-surface rounded-card border p-4 shadow-card"
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-content-tertiary text-xs font-medium">{index.weeks} weeks</p>
                <p className={cn('tabular text-xl font-semibold', tone.text)}>
                  {index.value === null ? '—' : index.value.toFixed(1)}
                </p>
              </div>

              <div className="bg-surface-inset mt-3 h-2 w-full overflow-hidden rounded-full">
                <div
                  className={cn('h-full rounded-full transition-[width]', tone.bar)}
                  style={{ width: `${index.value ?? 0}%` }}
                />
              </div>

              <p className="text-content-tertiary mt-2 text-[11px]">{noteFor(index)}</p>
              <p className="text-content-tertiary tabular mt-0.5 text-[11px]">
                {formatSigned(index.min)} to {formatSigned(index.max)}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
