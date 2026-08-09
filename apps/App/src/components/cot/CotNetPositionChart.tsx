import { useMemo, useState } from 'react';

import type { CotHistoryPointDTO } from '@tradepilot/shared';

import { SegmentedControl } from '@/components/ui/SegmentedControl';

import { compactContracts, formatSigned } from './cotFormat';

interface CotNetPositionChartProps {
  points: CotHistoryPointDTO[];
  speculatorLabel: string;
}

const RANGES = [
  { key: '52' as const, label: '1Y' },
  { key: '156' as const, label: '3Y' },
  { key: '260' as const, label: '5Y' },
];

type RangeKey = (typeof RANGES)[number]['key'];

const VIEW_WIDTH = 900;
const VIEW_HEIGHT = 280;
const PADDING = { top: 16, right: 16, bottom: 26, left: 64 };

const INNER_WIDTH = VIEW_WIDTH - PADDING.left - PADDING.right;
const INNER_HEIGHT = VIEW_HEIGHT - PADDING.top - PADDING.bottom;

const SERIES = [
  { key: 'specNet' as const, color: 'var(--color-brand)' },
  { key: 'commercialNet' as const, color: 'var(--color-negative)' },
];

function yearOf(reportDate: string) {
  return reportDate.slice(0, 4);
}

/**
 * Hand-rolled SVG rather than a charting dependency: two lines and a zero rule
 * is not worth 100 KB of bundle, and CSS variables keep it theme-correct.
 */
export function CotNetPositionChart({ points, speculatorLabel }: CotNetPositionChartProps) {
  const [range, setRange] = useState<RangeKey>('156');

  const weeks = Number(range);
  const visible = useMemo(() => points.slice(-weeks), [points, weeks]);

  const scale = useMemo(() => {
    const values = visible.flatMap((point) => [point.specNet, point.commercialNet]);
    const min = Math.min(...values, 0);
    const max = Math.max(...values, 0);
    const span = max - min || 1;

    return {
      min,
      max,
      x: (index: number) =>
        PADDING.left + (visible.length < 2 ? 0 : (index / (visible.length - 1)) * INNER_WIDTH),
      y: (value: number) => PADDING.top + (1 - (value - min) / span) * INNER_HEIGHT,
    };
  }, [visible]);

  if (visible.length < 2) {
    return (
      <div className="border-line bg-surface rounded-card border border-dashed p-10 text-center">
        <p className="text-content-secondary text-sm">
          Not enough history yet to chart this contract.
        </p>
      </div>
    );
  }

  const latest = visible[visible.length - 1]!;
  const toPath = (pick: (point: CotHistoryPointDTO) => number) =>
    visible
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${scale.x(index)} ${scale.y(pick(point))}`)
      .join(' ');

  const labelIndexes = [0, Math.floor((visible.length - 1) / 2), visible.length - 1];

  return (
    <div className="border-line bg-surface rounded-card border p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-content-primary text-sm font-semibold">Net positioning over time</h3>
          <p className="text-content-tertiary mt-0.5 text-xs">
            Long minus short, week by week. Speculators and commercials are structurally opposed.
          </p>
        </div>
        <SegmentedControl items={RANGES} value={range} onChange={setRange} className="max-w-[220px]" />
      </div>

      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        className="mt-4 h-[280px] w-full"
        role="img"
        aria-label={`${speculatorLabel} and commercial net positions over the last ${weeks} weeks`}
      >
        <line
          x1={PADDING.left}
          x2={VIEW_WIDTH - PADDING.right}
          y1={scale.y(0)}
          y2={scale.y(0)}
          stroke="var(--color-line)"
          strokeDasharray="4 4"
        />

        {[scale.max, 0, scale.min].map((value) => (
          <text
            key={value}
            x={PADDING.left - 10}
            y={scale.y(value) + 4}
            textAnchor="end"
            fontSize="11"
            fill="var(--color-content-tertiary)"
          >
            {compactContracts(Math.round(value))}
          </text>
        ))}

        {labelIndexes.map((index) => (
          <text
            key={index}
            x={scale.x(index)}
            y={VIEW_HEIGHT - 6}
            textAnchor={index === 0 ? 'start' : index === visible.length - 1 ? 'end' : 'middle'}
            fontSize="11"
            fill="var(--color-content-tertiary)"
          >
            {visible[index]!.reportDate}
          </text>
        ))}

        {SERIES.map((series) => (
          <path
            key={series.key}
            d={toPath((point) => point[series.key])}
            fill="none"
            stroke={series.color}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
      </svg>

      <div className="border-line-subtle mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 border-t pt-3">
        <span className="text-content-secondary flex items-center gap-2 text-xs">
          <span className="h-0.5 w-4 rounded" style={{ background: 'var(--color-brand)' }} />
          {speculatorLabel}
          <span className="text-content-primary tabular font-semibold">
            {formatSigned(latest.specNet)}
          </span>
        </span>
        <span className="text-content-secondary flex items-center gap-2 text-xs">
          <span className="h-0.5 w-4 rounded" style={{ background: 'var(--color-negative)' }} />
          Commercial
          <span className="text-content-primary tabular font-semibold">
            {formatSigned(latest.commercialNet)}
          </span>
        </span>
        <span className="text-content-tertiary text-xs">
          {visible.length} weeks · {yearOf(visible[0]!.reportDate)}–{yearOf(latest.reportDate)}
        </span>
      </div>
    </div>
  );
}
