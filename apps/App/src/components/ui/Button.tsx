import { ButtonHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  fullWidth?: boolean;
}

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-brand-fg shadow-sm hover:bg-brand-hover active:bg-brand-active',
  secondary: 'bg-surface-muted text-content-primary hover:bg-line',
  outline: 'border border-line-strong bg-surface text-content-primary hover:bg-surface-muted',
  ghost: 'bg-transparent text-content-secondary hover:bg-surface-muted hover:text-content-primary',
  danger: 'bg-negative text-white shadow-sm hover:brightness-110 active:brightness-95',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-9 px-4 text-sm gap-2',
  lg: 'h-11 px-5 text-sm gap-2',
};

export function Button({
  className,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  fullWidth = false,
  children,
  disabled,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-lg font-semibold transition-colors',
        'focus-visible:ring-brand focus-visible:ring-offset-canvas focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
        'disabled:pointer-events-none disabled:opacity-50',
        variants[variant],
        sizes[size],
        fullWidth && 'w-full',
        className,
      )}
      disabled={isLoading || disabled}
      {...props}
    >
      {isLoading ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>Loading…</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
