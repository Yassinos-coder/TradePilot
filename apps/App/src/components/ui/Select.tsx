import { forwardRef, SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';

import { cn } from '@/lib/utils';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
  options: ReadonlyArray<SelectOption>;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, label, hint, error, options, id, ...props },
  ref,
) {
  const selectId = id ?? label?.toLowerCase().replace(/\s+/g, '-');

  return (
    // See Input: content-start stops a hintless field being pushed down by a
    // taller sibling in the same grid row.
    <div className="grid content-start gap-1.5">
      {label ? (
        <label htmlFor={selectId} className="text-content-secondary pl-0.5 text-xs font-medium">
          {label}
        </label>
      ) : null}
      <div className="relative flex items-center">
        <select
          ref={ref}
          id={selectId}
          className={cn(
            'bg-surface text-content-primary h-10 w-full cursor-pointer appearance-none rounded-lg border pr-9 pl-3 text-sm transition-colors',
            'focus:ring-brand/25 focus:border-brand focus:ring-2 focus:outline-none',
            'disabled:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60',
            error ? 'border-negative focus:border-negative' : 'border-line-strong',
            className,
          )}
          {...props}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden
          className="text-content-tertiary pointer-events-none absolute right-3 h-4 w-4"
        />
      </div>
      {error ? (
        <p className="text-negative-content text-xs">{error}</p>
      ) : hint ? (
        <p className="text-content-tertiary text-xs">{hint}</p>
      ) : null}
    </div>
  );
});
