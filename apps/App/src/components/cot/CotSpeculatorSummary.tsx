import { Scale, TrendingDown, TrendingUp, Users } from 'lucide-react';

import type { CotSpeculatorSummaryDTO } from '@tradepilot/shared';

import { StatTile } from '@/components/ui/StatTile';
import { cn } from '@/lib/utils';

import { formatContracts, formatPercent, formatSigned } from './cotFormat';

interface CotSpeculatorSummaryProps {
  speculators: CotSpeculatorSummaryDTO;
}

/**
 * A ratio this lopsided means one side of the trade is crowded, which matters
 * as much as the direction — crowded books are what unwind violently.
 */
const CROWDED_LONG_RATIO = 5;
const CROWDED_SHORT_RATIO = 0.2;

function crowdingNote(ratio: number | null) {
  if (ratio === null) {
    return null;
  }

  if (ratio >= CROWDED_LONG_RATIO) {
    return 'Heavily one-sided long — crowded positioning is squeeze-prone.';
  }

  if (ratio <= CROWDED_SHORT_RATIO) {
    return 'Heavily one-sided short — crowded positioning is squeeze-prone.';
  }

  return null;
}

export function CotSpeculatorSummary({ speculators }: CotSpeculatorSummaryProps) {
  const isLong = speculators.bias === 'LONG';
  const crowding = crowdingNote(speculators.longShortRatio);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-content-primary text-sm font-semibold">
          {speculators.label} — the speculative money
        </h3>
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[11px] font-semibold',
            speculators.bias === 'FLAT'
              ? 'bg-surface-muted text-content-secondary'
              : isLong
                ? 'bg-positive-subtle text-positive-content'
                : 'bg-negative-subtle text-negative-content',
          )}
        >
          Net {speculators.bias.toLowerCase()}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Net position"
          value={formatSigned(speculators.net)}
          icon={isLong ? TrendingUp : TrendingDown}
          hint={`${formatContracts(speculators.long)} long vs ${formatContracts(speculators.short)} short`}
        />
        <StatTile
          label="Net change on the week"
          value={formatSigned(speculators.netChange)}
          icon={Users}
          hint={`Longs ${formatSigned(speculators.longChange)} · shorts ${formatSigned(speculators.shortChange)}`}
        />
        <StatTile
          label="Long / short ratio"
          value={speculators.longShortRatio === null ? '—' : `${speculators.longShortRatio.toFixed(2)} : 1`}
          icon={Scale}
          hint={crowding ?? 'Balanced enough to be unremarkable.'}
        />
        <StatTile
          label="Net share of open interest"
          value={formatPercent(speculators.netPctOi)}
          hint="How much of the whole market this bucket's net bet represents."
        />
      </div>
    </div>
  );
}
