import { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';

import { cn } from '@/lib/utils';

type AlertTone = 'neutral' | 'info' | 'warning' | 'danger' | 'positive';

const tones: Record<AlertTone, string> = {
  neutral: 'bg-surface-muted border-line text-content-secondary',
  info: 'bg-info-subtle border-info/20 text-info-content',
  warning: 'bg-warning-subtle border-warning/25 text-warning-content',
  danger: 'bg-negative-subtle border-negative/25 text-negative-content',
  positive: 'bg-positive-subtle border-positive/25 text-positive-content',
};

const icons: Record<AlertTone, typeof Info | null> = {
  neutral: null,
  info: Info,
  warning: AlertTriangle,
  danger: XCircle,
  positive: CheckCircle2,
};

interface AlertProps {
  tone?: AlertTone;
  title?: string;
  children: ReactNode;
  className?: string;
}

export function Alert({ tone = 'neutral', title, children, className }: AlertProps) {
  const Icon = icons[tone];

  return (
    <div
      role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'}
      className={cn('flex w-full items-start gap-2.5 rounded-lg border px-3.5 py-2.5', tones[tone], className)}
    >
      {Icon ? <Icon aria-hidden className="mt-0.5 h-4 w-4 shrink-0" /> : null}
      <div className="min-w-0 flex-1 text-sm leading-5">
        {title ? <p className="font-semibold">{title}</p> : null}
        <div className={cn(title && 'mt-0.5')}>{children}</div>
      </div>
    </div>
  );
}
