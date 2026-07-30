import { useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

export interface SegmentItem<T extends string> {
  key: T;
  label: string;
  disabled?: boolean;
}

interface SegmentedControlProps<T extends string> {
  items: ReadonlyArray<SegmentItem<T>>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/** Pill switcher with a sliding active indicator. Segments share the width evenly. */
export function SegmentedControl<T extends string>({
  items,
  value,
  onChange,
  className,
}: SegmentedControlProps<T>) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) {
      return;
    }

    const activeSegment = track.querySelector<HTMLElement>(`[data-segment-key="${value}"]`);
    if (!activeSegment) {
      return;
    }

    setIndicator({ left: activeSegment.offsetLeft, width: activeSegment.offsetWidth });
  }, [value, items]);

  return (
    <div className={cn('bg-surface-muted inline-flex w-full rounded-xl p-1', className)}>
      <div ref={trackRef} role="tablist" className="relative z-0 flex h-9 w-full items-center gap-1">
        {indicator ? (
          <span
            aria-hidden
            className="bg-surface pointer-events-none absolute top-0 z-0 h-9 rounded-lg shadow-sm transition-[left,width] duration-200 ease-out"
            style={{ left: indicator.left, width: indicator.width }}
          />
        ) : null}
        {items.map((item) => {
          const isActive = item.key === value;
          return (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              data-segment-key={item.key}
              disabled={item.disabled}
              onClick={() => onChange(item.key)}
              className={cn(
                'relative z-10 h-9 min-w-0 flex-1 cursor-pointer rounded-lg px-3 text-sm font-semibold whitespace-nowrap transition-colors',
                'focus-visible:ring-brand focus-visible:ring-2 focus-visible:outline-none',
                isActive
                  ? 'text-content-primary'
                  : 'text-content-tertiary hover:text-content-secondary',
                item.disabled && 'cursor-not-allowed opacity-50',
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
