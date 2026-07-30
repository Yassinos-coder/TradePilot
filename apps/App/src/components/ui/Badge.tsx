import { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export type BadgeTone = 'positive' | 'warning' | 'danger' | 'neutral' | 'info' | 'brand';

const tones: Record<BadgeTone, string> = {
  positive: 'bg-positive-subtle text-positive-content ring-positive/20',
  warning: 'bg-warning-subtle text-warning-content ring-warning/20',
  danger: 'bg-negative-subtle text-negative-content ring-negative/20',
  info: 'bg-info-subtle text-info-content ring-info/20',
  brand: 'bg-brand-subtle text-brand ring-brand/20',
  neutral: 'bg-surface-muted text-content-secondary ring-line',
};

const dotTones: Record<BadgeTone, string> = {
  positive: 'bg-positive',
  warning: 'bg-warning',
  danger: 'bg-negative',
  info: 'bg-info',
  brand: 'bg-brand',
  neutral: 'bg-content-tertiary',
};

interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  dot?: boolean;
  pulse?: boolean;
  className?: string;
}

export function Badge({ tone = 'neutral', dot = false, pulse = false, children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        tones[tone],
        className,
      )}
    >
      {dot ? (
        <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', dotTones[tone], pulse && 'animate-pulse')} />
      ) : null}
      {children}
    </span>
  );
}
