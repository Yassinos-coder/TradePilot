import { cn } from '@/lib/utils';

import { formatSigned } from './cotFormat';

interface CotChangeChipProps {
  value: number;
  className?: string;
}

export function CotChangeChip({ value, className }: CotChangeChipProps) {
  if (value === 0) {
    return <span className={cn('text-content-tertiary tabular text-[11px]', className)}>0</span>;
  }

  return (
    <span
      className={cn(
        'tabular inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold',
        value > 0 ? 'bg-positive-subtle text-positive-content' : 'bg-negative-subtle text-negative-content',
        className,
      )}
    >
      {formatSigned(value)}
    </span>
  );
}
