import { ReactNode } from 'react';

import { cn } from '../../lib/utils';

type BadgeTone = 'positive' | 'warning' | 'danger' | 'neutral' | 'info';

const tones: Record<BadgeTone, string> = {
  positive:
    'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/20',
  warning:
    'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/20',
  danger:
    'bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-400 dark:ring-red-500/20',
  info:
    'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:ring-blue-500/20',
  neutral:
    'bg-gray-100 text-gray-600 ring-gray-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700',
};

interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  dot?: boolean;
}

export function Badge({ tone = 'neutral', dot = false, children }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1',
        tones[tone],
      )}
    >
      {dot && (
        <span
          className={cn('h-1.5 w-1.5 rounded-full', {
            'bg-emerald-500': tone === 'positive',
            'bg-amber-500': tone === 'warning',
            'bg-red-500': tone === 'danger',
            'bg-blue-500': tone === 'info',
            'bg-gray-400 dark:bg-slate-500': tone === 'neutral',
          })}
        />
      )}
      {children}
    </span>
  );
}
