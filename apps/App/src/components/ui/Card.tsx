import { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface CardProps {
  title?: string;
  eyebrow?: string;
  description?: string;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
  actions?: ReactNode;
}

export function Card({
  title,
  eyebrow,
  description,
  className,
  bodyClassName,
  children,
  actions,
}: CardProps) {
  const hasHeader = Boolean(eyebrow || title || description || actions);

  return (
    <section
      className={cn('border-line bg-surface rounded-card border shadow-card', className)}
    >
      {hasHeader ? (
        <header className="border-line-subtle flex items-start justify-between gap-4 border-b px-5 py-4">
          <div className="min-w-0 space-y-0.5">
            {eyebrow ? (
              <p className="text-brand text-[11px] font-semibold tracking-widest uppercase">
                {eyebrow}
              </p>
            ) : null}
            {title ? (
              <h2 className="text-content-primary text-sm font-semibold">{title}</h2>
            ) : null}
            {description ? (
              <p className="text-content-tertiary text-xs leading-5">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </header>
      ) : null}
      <div className={cn('p-5', bodyClassName)}>{children}</div>
    </section>
  );
}
