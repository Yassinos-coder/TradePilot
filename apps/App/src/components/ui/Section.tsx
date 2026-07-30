import { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface SectionProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

/**
 * Titled section: an h2 outside a bordered surface card.
 * The settings pages stack these; `footer` holds the save row.
 */
export function Section({
  title,
  description,
  actions,
  footer,
  children,
  className,
  bodyClassName,
}: SectionProps) {
  return (
    <section className={className}>
      <div className="mb-3 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-content-primary text-base font-semibold tracking-tight">{title}</h2>
          {description ? (
            <p className="text-content-tertiary mt-0.5 text-xs leading-5">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      <div className="border-line bg-surface rounded-card overflow-hidden border shadow-card">
        <div className={cn('p-5 sm:p-6', bodyClassName)}>{children}</div>
        {footer ? (
          <div className="border-line-subtle bg-surface-inset border-t px-5 py-4 sm:px-6">
            {footer}
          </div>
        ) : null}
      </div>
    </section>
  );
}

interface FieldGridProps {
  children: ReactNode;
  className?: string;
}

/** Standard two-up form grid used inside sections. */
export function FieldGrid({ children, className }: FieldGridProps) {
  return <div className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2', className)}>{children}</div>;
}
