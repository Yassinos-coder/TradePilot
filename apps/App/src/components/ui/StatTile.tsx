import { ReactNode } from 'react';
import { ArrowDown, ArrowUp, type LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

interface StatTileProps {
  label: string;
  value: ReactNode;
  icon?: LucideIcon;
  /** Signed percentage shown next to the value with a direction arrow. */
  deltaPercent?: number | null;
  hint?: string;
  className?: string;
}

export function StatTile({ label, value, icon: Icon, deltaPercent, hint, className }: StatTileProps) {
  const hasDelta = typeof deltaPercent === 'number' && Number.isFinite(deltaPercent);
  const isUp = hasDelta && deltaPercent >= 0;

  return (
    <div className={cn('border-line bg-surface rounded-card border p-4 shadow-card', className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-content-tertiary text-xs font-medium">{label}</p>
        {Icon ? (
          <span className="bg-brand-subtle text-brand flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
            <Icon aria-hidden className="h-4 w-4" />
          </span>
        ) : null}
      </div>
      <p className="text-content-primary tabular mt-2 text-2xl font-semibold tracking-tight">
        {value}
      </p>
      {hasDelta || hint ? (
        <div className="mt-1.5 flex items-center gap-2">
          {hasDelta ? (
            <span
              className={cn(
                'inline-flex items-center gap-0.5 text-xs font-semibold',
                isUp ? 'text-positive-content' : 'text-negative-content',
              )}
            >
              {isUp ? (
                <ArrowUp aria-hidden className="h-3 w-3" />
              ) : (
                <ArrowDown aria-hidden className="h-3 w-3" />
              )}
              {Math.abs(deltaPercent).toFixed(2)}%
            </span>
          ) : null}
          {hint ? <span className="text-content-tertiary text-xs">{hint}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
