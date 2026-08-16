import { ArrowRight, Check } from 'lucide-react';
import { Link } from 'react-router-dom';

import type { PricingPlan } from '@/interfaces/pricing';
import { cn } from '@/lib/utils';

export function PricingPlanCard({ plan }: { plan: PricingPlan }) {
  return (
    <article
      className={cn(
        'relative flex flex-col rounded-3xl border p-6 shadow-sm transition-shadow',
        plan.featured
          ? 'border-brand/45 bg-brand-subtle shadow-[0_24px_60px_-32px_rgba(25,154,142,0.55)]'
          : 'border-line bg-surface',
      )}
    >
      {plan.featured ? (
        <span className="bg-brand text-brand-fg absolute -top-3 left-6 rounded-full px-3 py-1 text-[10px] font-semibold tracking-[0.18em] uppercase">
          {plan.highlight}
        </span>
      ) : null}

      <p className="text-content-tertiary text-xs font-semibold tracking-[0.22em] uppercase">
        {plan.name}
      </p>

      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-content-primary text-4xl font-semibold tracking-tight">
          {plan.price}
        </span>
        <span className="text-content-tertiary text-sm">{plan.cadence}</span>
      </div>

      <p className="text-content-secondary mt-3 text-sm leading-6">{plan.tagline}</p>

      {!plan.featured ? (
        <p className="text-content-tertiary mt-3 text-[11px] font-medium tracking-[0.16em] uppercase">
          {plan.highlight}
        </p>
      ) : null}

      <ul className="mt-6 flex-1 space-y-2.5">
        {plan.features.map((feature) => (
          <li key={feature} className="text-content-secondary flex items-start gap-2 text-sm">
            <span
              className={cn(
                'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full',
                plan.featured ? 'bg-brand text-brand-fg' : 'bg-positive-subtle text-positive',
              )}
            >
              <Check className="h-3 w-3" />
            </span>
            {feature}
          </li>
        ))}
      </ul>

      <Link
        to="/auth"
        className={cn(
          'mt-7 inline-flex w-full items-center justify-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-colors',
          plan.featured
            ? 'bg-brand text-brand-fg hover:bg-brand-hover'
            : 'border-line-strong text-content-primary hover:bg-surface-muted border',
        )}
      >
        {plan.cta}
        <ArrowRight className="h-4 w-4" />
      </Link>
    </article>
  );
}
