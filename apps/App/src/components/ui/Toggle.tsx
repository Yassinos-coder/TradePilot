import { cn } from '../../lib/utils';

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
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30',
        checked
          ? 'border-blue-200 bg-blue-50 dark:border-blue-500/20 dark:bg-blue-500/5'
          : 'border-gray-200 bg-white hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:bg-slate-800',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <div>
        <p className={cn('text-sm font-medium', checked ? 'text-gray-900 dark:text-slate-100' : 'text-gray-700 dark:text-slate-300')}>
          {label}
        </p>
        {description && (
          <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-500">{description}</p>
        )}
      </div>
      {/* Track */}
      <span
        className={cn(
          'relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors duration-200',
          checked ? 'bg-blue-600' : 'bg-gray-300 dark:bg-slate-600',
        )}
      >
        {/* Thumb */}
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
