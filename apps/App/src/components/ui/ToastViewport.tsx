import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

import { cn } from '../../lib/utils';
import { useToastStore, type ToastTone } from '../../store/toast-store';

const toneStyles: Record<ToastTone, string> = {
  success:
    'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-100',
  error:
    'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-100',
  info:
    'border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-100',
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
    <div className="pointer-events-none fixed right-0 top-0 z-50 flex w-full max-w-sm flex-col gap-3 p-4">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            'pointer-events-auto rounded-xl border shadow-lg backdrop-blur',
            toneStyles[toast.tone],
          )}
        >
          <div className="flex items-start gap-3 p-4">
            <div className="mt-0.5 shrink-0">
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
              className="shrink-0 rounded-md p-1 opacity-70 transition hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/5"
              aria-label="Dismiss notification"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
