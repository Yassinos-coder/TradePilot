import { forwardRef, InputHTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  label?: string;
  hint?: string;
  error?: string;
  prefix?: ReactNode;
  suffix?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, label, hint, error, prefix, suffix, id, ...props },
  ref,
) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="grid gap-1.5">
      {label ? (
        <label htmlFor={inputId} className="text-content-secondary pl-0.5 text-xs font-medium">
          {label}
        </label>
      ) : null}
      <div className="relative flex items-center">
        {prefix ? (
          <span className="text-content-tertiary pointer-events-none absolute left-3">{prefix}</span>
        ) : null}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'bg-surface text-content-primary placeholder:text-content-tertiary h-10 w-full rounded-lg border text-sm transition-colors',
            'focus:ring-brand/25 focus:border-brand focus:ring-2 focus:outline-none',
            'disabled:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60',
            error ? 'border-negative focus:border-negative focus:ring-negative/25' : 'border-line-strong',
            prefix ? 'pl-9' : 'pl-3',
            suffix ? 'pr-9' : 'pr-3',
            className,
          )}
          {...props}
        />
        {suffix ? (
          <span className="text-content-tertiary pointer-events-none absolute right-3">{suffix}</span>
        ) : null}
      </div>
      {error ? (
        <p className="text-negative-content text-xs">{error}</p>
      ) : hint ? (
        <p className="text-content-tertiary text-xs">{hint}</p>
      ) : null}
    </div>
  );
});
