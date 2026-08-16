import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useToastStore, type ToastTone } from '@/store/toast-store';

const toneStyles: Record<ToastTone, string> = {
  success: 'border-positive/25 bg-positive-subtle text-positive-content',
  error: 'border-negative/25 bg-negative-subtle text-negative-content',
  info: 'border-info/25 bg-info-subtle text-info-content',
};

function ToneIcon({ tone }: { tone: ToastTone }) {
  if (tone === 'success') {
    return <CheckCircle2 className="h-4 w-4" />;
  }

  if (tone === 'error') {
    return <AlertCircle className="h-4 w-4" />;
  }

  return <Info className="h-4 w-4" />;
}

export function ToastViewport() {
  const toasts = useToastStore((state) => state.toasts);
  const dismiss = useToastStore((state) => state.dismiss);

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed top-0 right-0 z-50 flex w-full max-w-sm flex-col gap-3 p-4 pt-[max(1rem,env(safe-area-inset-top))]"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role={toast.tone === 'error' ? 'alert' : 'status'}
          className={cn(
            'pointer-events-auto rounded-xl border shadow-lg backdrop-blur',
            toneStyles[toast.tone],
          )}
        >
          <div className="flex items-start gap-3 p-4">
            <div aria-hidden className="mt-0.5 shrink-0">
              <ToneIcon tone={toast.tone} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{toast.title}</p>
              {toast.description ? (
                <p className="mt-1 text-sm opacity-85">{toast.description}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              className="shrink-0 cursor-pointer rounded-md p-1 opacity-70 transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:ring-current focus-visible:outline-none"
              aria-label="Dismiss notification"
            >
              <X aria-hidden className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
