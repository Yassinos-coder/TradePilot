import { useMemo, useState } from 'react';

import type { CotHistoryPointDTO } from '@tradepilot/shared';

import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { cn } from '@/lib/utils';

import { compactContracts, formatContracts } from './cotFormat';

interface CotCategoryHistoryChartProps {
  points: CotHistoryPointDTO[];
}

type LongKey = 'nonCommercialLong' | 'commercialLong' | 'nonReportableLong';
type ShortKey = 'nonCommercialShort' | 'commercialShort' | 'nonReportableShort';

interface CategorySeries {
  key: string;
  label: string;
  color: string;
  long: LongKey;
  short: ShortKey;
}

const CATEGORIES: CategorySeries[] = [
  {
    key: 'non_commercial',
    label: 'Non-Commercial',
    color: 'var(--color-brand)',
    long: 'nonCommercialLong',
    short: 'nonCommercialShort',
  },
  {
    key: 'commercial',
    label: 'Commercial',
    color: 'var(--color-negative)',
    long: 'commercialLong',
    short: 'commercialShort',
  },
  {
    key: 'non_reportable',
    label: 'Non-Reportable',
    color: 'var(--color-info)',
    long: 'nonReportableLong',
    short: 'nonReportableShort',
  },
];

const RANGES = [
  { key: '260' as const, label: '5Y' },
  { key: '520' as const, label: '10Y' },
  { key: 'all' as const, label: 'All' },
];

type RangeKey = (typeof RANGES)[number]['key'];

const VIEW_WIDTH = 960;
const VIEW_HEIGHT = 320;
const PADDING = { top: 16, right: 16, bottom: 28, left: 64 };

const INNER_WIDTH = VIEW_WIDTH - PADDING.left - PADDING.right;
const INNER_HEIGHT = VIEW_HEIGHT - PADDING.top - PADDING.bottom;

const GRID_STEPS = 4;
const X_LABEL_COUNT = 6;

/**
 * Gross long and short by trader category across the whole archive. Longs are
 * solid and shorts dashed within one colour per category, so a category reads as
 * a pair and the crossings — where a group flips from net long to net short —
 * stay visible.
 */
export function CotCategoryHistoryChart({ points }: CotCategoryHistoryChartProps) {
  const [range, setRange] = useState<RangeKey>('all');
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const active = CATEGORIES.filter((category) => !hidden.has(category.key));

  const visible = useMemo(
    () => (range === 'all' ? points : points.slice(-Number(range))),
    [points, range],
  );

  const scale = useMemo(() => {
    const values = visible.flatMap((point) =>
      active.flatMap((category) => [point[category.long], point[category.short]]),
    );

    const max = values.length > 0 ? Math.max(...values) : 1;

    return {
      max,
      x: (index: number) =>
        PADDING.left + (visible.length < 2 ? 0 : (index / (visible.length - 1)) * INNER_WIDTH),
      y: (value: number) => PADDING.top + (1 - value / (max || 1)) * INNER_HEIGHT,
    };
  }, [visible, active]);

  const toggle = (key: string) => {
    const next = new Set(hidden);

    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }

    // Blanking every series would leave an empty frame with no way back in.
    if (next.size < CATEGORIES.length) {
      setHidden(next);
    }
  };

  if (visible.length < 2) {
    return (
      <div className="border-line bg-surface rounded-card border border-dashed p-10 text-center">
        <p className="text-content-secondary text-sm">
          Not enough history yet to chart this contract.
        </p>
      </div>
    );
  }

  const first = visible[0]!;
  const latest = visible[visible.length - 1]!;

  const toPath = (pick: (point: CotHistoryPointDTO) => number) =>
    visible
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${scale.x(index)} ${scale.y(pick(point))}`)
      .join(' ');

  const gridValues = Array.from({ length: GRID_STEPS + 1 }, (_, step) => (scale.max / GRID_STEPS) * step);
  const labelIndexes = Array.from({ length: X_LABEL_COUNT }, (_, step) =>
    Math.round((step / (X_LABEL_COUNT - 1)) * (visible.length - 1)),
  );

  return (
    <div className="border-line bg-surface rounded-card border p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-content-primary text-sm font-semibold">
            Long and short by category, full history
          </h3>
          <p className="text-content-tertiary mt-0.5 text-xs">
            Gross positions week by week from {first.reportDate} to {latest.reportDate}. Solid is
            long, dashed is short.
          </p>
        </div>
        <SegmentedControl items={RANGES} value={range} onChange={setRange} className="max-w-[220px]" />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {CATEGORIES.map((category) => {
          const isActive = !hidden.has(category.key);

          return (
            <button
              key={category.key}
              type="button"
              onClick={() => toggle(category.key)}
              aria-pressed={isActive}
              className={cn(
                'inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                isActive
                  ? 'border-line-strong text-content-primary'
                  : 'border-line text-content-tertiary opacity-60',
              )}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: isActive ? category.color : 'var(--color-content-tertiary)' }}
              />
              {category.label}
            </button>
          );
        })}
      </div>

      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        className="mt-3 h-[320px] w-full"
        role="img"
        aria-label="Long and short positions by trader category over the full history"
      >
        {gridValues.map((value) => (
          <g key={value}>
            <line
              x1={PADDING.left}
              x2={VIEW_WIDTH - PADDING.right}
              y1={scale.y(value)}
              y2={scale.y(value)}
              stroke="var(--color-line-subtle)"
            />
            <text
              x={PADDING.left - 10}
              y={scale.y(value) + 4}
              textAnchor="end"
              fontSize="11"
              fill="var(--color-content-tertiary)"
            >
              {compactContracts(value)}
            </text>
          </g>
        ))}

        {labelIndexes.map((index, position) => (
          <text
            key={`${index}-${position}`}
            x={scale.x(index)}
            y={VIEW_HEIGHT - 8}
            textAnchor={position === 0 ? 'start' : position === X_LABEL_COUNT - 1 ? 'end' : 'middle'}
            fontSize="11"
            fill="var(--color-content-tertiary)"
          >
            {visible[index]!.reportDate.slice(0, 7)}
          </text>
        ))}

        {active.map((category) => (
          <g key={category.key}>
            <path
              d={toPath((point) => point[category.long])}
              fill="none"
              stroke={category.color}
              strokeWidth="1.75"
              strokeLinejoin="round"
            />
            <path
              d={toPath((point) => point[category.short])}
              fill="none"
              stroke={category.color}
              strokeWidth="1.75"
              strokeDasharray="5 3"
              strokeOpacity="0.75"
              strokeLinejoin="round"
            />
          </g>
        ))}
      </svg>

      <div className="border-line-subtle mt-3 overflow-x-auto border-t pt-3">
        <table className="w-full min-w-[420px] text-left">
          <thead>
            <tr className="text-content-tertiary text-[11px]">
              <th className="py-1 font-medium">Latest — {latest.reportDate}</th>
              <th className="py-1 text-right font-medium">Long</th>
              <th className="py-1 text-right font-medium">Short</th>
              <th className="py-1 text-right font-medium">Net</th>
            </tr>
          </thead>
          <tbody>
            {CATEGORIES.map((category) => {
              const long = latest[category.long];
              const short = latest[category.short];

              return (
                <tr key={category.key} className="text-xs">
                  <td className="text-content-secondary flex items-center gap-2 py-1">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: category.color }}
                    />
                    {category.label}
                  </td>
                  <td className="text-content-primary tabular py-1 text-right font-semibold">
                    {formatContracts(long)}
                  </td>
                  <td className="text-content-primary tabular py-1 text-right font-semibold">
                    {formatContracts(short)}
                  </td>
                  <td
                    className={cn(
                      'tabular py-1 text-right font-semibold',
                      long - short >= 0 ? 'text-positive-content' : 'text-negative-content',
                    )}
                  >
                    {formatContracts(long - short)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
