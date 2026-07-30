import { Check } from 'lucide-react';
import { Link } from 'react-router-dom';

import { PublicSiteLayout } from '../components/layout/PublicSiteLayout';

const PLANS = [
  {
    name: 'FREE',
    price: '$0',
    subtitle: 'Starter',
    features: ['2 trading accounts', '1 master → 1 slave link', 'Basic dashboard', 'Community support'],
  },
  {
    name: 'PRO',
    price: '$19',
    subtitle: 'Per month',
    featured: true,
    features: [
      'Up to 5 trading accounts',
      'Unlimited master → slave links',
      'Full per-link risk parameters',
      'Advanced analytics + history import',
      'Email notifications',
    ],
  },
  {
    name: 'PRO+',
    price: '$39',
    subtitle: 'Per month',
    features: [
      'Unlimited connected accounts',
      'Priority copy dispatch',
      'REST trade API access',
      'API key rotation + request signing',
      'Priority support',
    ],
  },
];

export function PricingPage() {
  return (
    <PublicSiteLayout
      title="Simple SaaS pricing"
      subtitle="Choose a plan based on account scale and operational requirements. You can cancel subscriptions at any time from your billing settings."
    >
      <div className="grid gap-4 lg:grid-cols-3">
        {PLANS.map((plan) => (
          <article
            key={plan.name}
            className={[
              'rounded-3xl border p-6 shadow-sm',
              plan.featured
                ? 'border-brand/40 bg-brand-subtle'
                : 'border-line bg-surface',
            ].join(' ')}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-content-tertiary">
              {plan.name}
            </p>
            <p className="mt-3 text-4xl font-semibold tracking-tight text-content-primary">
              {plan.price}
            </p>
            <p className="mt-1 text-sm text-content-tertiary">{plan.subtitle}</p>

            <ul className="mt-6 space-y-2">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm text-content-secondary">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-positive" />
                  {feature}
                </li>
              ))}
            </ul>

            <Link
              to="/auth"
              className={[
                'mt-6 inline-flex w-full items-center justify-center rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors',
                plan.featured
                  ? 'bg-brand text-content-inverse hover:bg-brand'
                  : 'bg-surface text-content-inverse hover:bg-line-strong',
              ].join(' ')}
            >
              Choose {plan.name}
            </Link>
          </article>
        ))}
      </div>
    </PublicSiteLayout>
  );
}
