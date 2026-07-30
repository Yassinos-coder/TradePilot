import { useState } from 'react';
import { Check, Copy, Eye, EyeOff } from 'lucide-react';

import { cn } from '@/lib/utils';

interface SecretFieldProps {
  value: string;
  label?: string;
  /** Start masked; the caller decides whether a secret is ever revealable. */
  maskable?: boolean;
  className?: string;
}

export function SecretField({ value, label, maskable = true, className }: SecretFieldProps) {
  const [revealed, setRevealed] = useState(!maskable);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className={cn('grid gap-1.5', className)}>
      {label ? (
        <span className="text-content-secondary pl-0.5 text-xs font-medium">{label}</span>
      ) : null}
      <div className="border-line-strong bg-surface-muted flex items-center gap-2 rounded-lg border px-3 py-2">
        <code className="text-content-primary min-w-0 flex-1 truncate font-mono text-xs">
          {revealed ? value : '•'.repeat(Math.min(value.length, 44))}
        </code>
        {maskable ? (
          <button
            type="button"
            onClick={() => setRevealed((previous) => !previous)}
            aria-label={revealed ? 'Hide value' : 'Reveal value'}
            className="text-content-tertiary hover:text-content-primary shrink-0 cursor-pointer rounded p-1 transition-colors"
          >
            {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => void copy()}
          aria-label="Copy to clipboard"
          className="text-content-tertiary hover:text-content-primary shrink-0 cursor-pointer rounded p-1 transition-colors"
        >
          {copied ? (
            <Check className="text-positive h-3.5 w-3.5" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    </div>
  );
}
