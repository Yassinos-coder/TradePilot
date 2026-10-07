import { TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react';

import { cn, formatCurrency } from '@/lib/utils';
import { Skeleton } from '@/components/ui/Skeleton';

interface NetValueTileProps {
  label: string;
  value: number | null;
  isLoading: boolean;
  caption: string;
  neutralIcon?: LucideIcon;
}

export function NetValueTile({ label, value, isLoading, caption, neutralIcon }: NetValueTileProps) {
  const isUnknown = value === null;
  const isPositive = !isUnknown && value >= 0;
  const Icon = neutralIcon ?? (isPositive ? TrendingUp : TrendingDown);

  return (
    <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-widest text-content-tertiary">{label}</p>
      {isLoading ? (
        <Skeleton className="mt-3 h-9 w-32" />
      ) : (
        <div className="mt-3 flex items-center gap-3">
          <div
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-xl',
              isUnknown ? 'bg-surface-muted' : isPositive ? 'bg-positive-subtle' : 'bg-negative-subtle',
            )}
          >
            <Icon
              className={cn('h-5 w-5', isUnknown ? 'text-content-tertiary' : isPositive ? 'text-positive' : 'text-negative')}
            />
          </div>
          <p
            className={cn(
              'text-3xl font-bold tracking-tight',
              isUnknown ? 'text-content-tertiary' : isPositive ? 'text-positive' : 'text-negative',
            )}
          >
            {isUnknown ? '--' : formatCurrency(value)}
          </p>
        </div>
      )}
      <p className="mt-2 text-xs text-content-tertiary">{caption}</p>
    </div>
  );
}
