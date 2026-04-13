import { ReactNode } from 'react';

import { cn } from '../../lib/utils';

interface CardProps {
  title?: string;
  eyebrow?: string;
  description?: string;
  className?: string;
  children: ReactNode;
  actions?: ReactNode;
}

export function Card({ title, eyebrow, description, className, children, actions }: CardProps) {
  return (
    <section
      className={cn(
        'rounded-xl border border-gray-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900',
        className,
      )}
    >
      {(eyebrow || title || description || actions) && (
        <header className="flex items-start justify-between gap-4 border-b border-gray-100 dark:border-slate-800 px-5 py-4">
          <div className="space-y-0.5">
            {eyebrow && (
              <p className="text-xs font-medium uppercase tracking-widest text-blue-600 dark:text-blue-400">
                {eyebrow}
              </p>
            )}
            {title && (
              <h2 className="text-sm font-semibold text-gray-900 dark:text-slate-100">{title}</h2>
            )}
            {description && (
              <p className="text-xs text-gray-500 dark:text-slate-500">{description}</p>
            )}
          </div>
          {actions && <div className="shrink-0">{actions}</div>}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}
