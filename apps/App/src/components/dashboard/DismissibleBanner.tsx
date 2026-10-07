import { ReactNode, useState } from 'react';
import { X } from 'lucide-react';

interface DismissibleBannerProps {
  storageKey: string;
  children: ReactNode;
}

function readDismissed(storageKey: string): boolean {
  try {
    return localStorage.getItem(storageKey) === '1';
  } catch {
    return false;
  }
}

export function DismissibleBanner({ storageKey, children }: DismissibleBannerProps) {
  const [dismissed, setDismissed] = useState(() => readDismissed(storageKey));

  if (dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(storageKey, '1');
    } catch {
      return;
    }
  };

  return (
    <div className="relative">
      {children}
      <button
        type="button"
        aria-label="Dismiss"
        onClick={dismiss}
        className="absolute top-1.5 right-1.5 z-10 rounded-md p-1 text-content-tertiary transition-colors hover:bg-surface-muted hover:text-content-primary"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
