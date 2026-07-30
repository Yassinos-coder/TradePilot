import { cn } from '@/lib/utils';

interface ToggleProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}

export function Toggle({ checked, onCheckedChange, label, description, disabled }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked ? 'true' : 'false'}
      onClick={() => !disabled && onCheckedChange(!checked)}
      disabled={disabled}
      className={cn(
        'flex w-full items-center justify-between gap-4 rounded-lg border px-4 py-3 text-left transition-colors',
        'focus-visible:ring-brand/30 focus-visible:ring-2 focus-visible:outline-none',
        checked
          ? 'border-brand/30 bg-brand-subtle'
          : 'border-line bg-surface hover:bg-surface-muted',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <div className="min-w-0">
        <p
          className={cn(
            'text-sm font-medium',
            checked ? 'text-content-primary' : 'text-content-secondary',
          )}
        >
          {label}
        </p>
        {description ? (
          <p className="text-content-tertiary mt-0.5 text-xs leading-5">{description}</p>
        ) : null}
      </div>
      <span
        className={cn(
          'relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors duration-200',
          checked ? 'bg-brand' : 'bg-line-strong',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200',
            checked ? 'translate-x-4' : 'translate-x-0.5',
          )}
        />
      </span>
    </button>
  );
}

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  label: string;
}

/** Bare switch with no surrounding row — for use inside table cells and headers. */
export function Switch({ checked, onCheckedChange, disabled, label }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked ? 'true' : 'false'}
      aria-label={label}
      onClick={() => !disabled && onCheckedChange(!checked)}
      disabled={disabled}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200',
        'focus-visible:ring-brand/30 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
        checked ? 'bg-brand' : 'bg-line-strong',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200',
          checked ? 'translate-x-4' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}
