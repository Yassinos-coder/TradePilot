import { Check } from 'lucide-react';
import { Link } from 'react-router-dom';

import { PublicSiteLayout } from '../components/layout/PublicSiteLayout';

const PLANS = [
  {
    name: 'FREE',
    price: '$0',
    subtitle: 'Starter',
    features: ['1 trading account', 'Basic dashboard', 'Manual signal ingest', 'Community support'],
  },
  {
    name: 'PRO',
    price: '$19',
    subtitle: 'Per month',
    featured: true,
    features: [
      'Up to 5 trading accounts',
      'Telegram realtime + backfill',
      'Execution guardrails',
      'Advanced analytics + history filters',
      'Email + Telegram notifications',
    ],
  },
  {
    name: 'PRO+',
    price: '$39',
    subtitle: 'Per month',
    features: [
      'Unlimited connected accounts',
      'Priority execution queue',
      'Premium risk/failsafe controls',
      'API key rotation + security controls',
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
                ? 'border-sky-300 bg-sky-50/70 dark:border-sky-500/40 dark:bg-sky-500/10'
                : 'border-slate-200/80 bg-white/90 dark:border-slate-800 dark:bg-slate-900/90',
            ].join(' ')}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
              {plan.name}
            </p>
            <p className="mt-3 text-4xl font-semibold tracking-tight text-slate-950 dark:text-white">
              {plan.price}
            </p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{plan.subtitle}</p>

            <ul className="mt-6 space-y-2">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  {feature}
                </li>
              ))}
            </ul>

            <Link
              to="/auth"
              className={[
                'mt-6 inline-flex w-full items-center justify-center rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors',
                plan.featured
                  ? 'bg-sky-600 text-white hover:bg-sky-700'
                  : 'bg-slate-900 text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white',
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
