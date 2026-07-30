import { Activity, BarChart3, ShieldCheck, Signal, Workflow } from 'lucide-react';
import { Link } from 'react-router-dom';

import { PublicSiteLayout } from '../components/layout/PublicSiteLayout';

const FEATURES = [
  {
    icon: Signal,
    title: 'Master to slave copying',
    body: 'Designate one MetaTrader account as master. Every open, close, partial close and SL/TP change is mirrored to your slave accounts in real time.',
  },
  {
    icon: Workflow,
    title: 'Per-account risk parameters',
    body: 'Each link carries its own sizing mode, lot caps, position limits, daily loss and drawdown ceilings, so two slaves off one master can run completely different risk.',
  },
  {
    icon: ShieldCheck,
    title: 'Guardrails that block, not warn',
    body: 'Position caps, daily loss limits, drawdown ceilings and equity floors are enforced before a copy is sent — and a close is never blocked.',
  },
  {
    icon: BarChart3,
    title: 'Directional analytics',
    body: 'Long/short performance is computed from position lifecycle direction, not closing transaction side.',
  },
];

export function LandingPage() {
  return (
    <PublicSiteLayout
      title="Copy trades across your MetaTrader accounts, with risk you control"
      subtitle="TradePilot mirrors every trade from your master account to your slave accounts over a live MT4/MT5 bridge, sizing each copy to the risk parameters you set per account."
    >
      <div className="grid gap-4 md:grid-cols-2">
        {FEATURES.map((feature) => (
          <article
            key={feature.title}
            className="rounded-3xl border border-line bg-surface p-6 shadow-sm"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-subtle text-brand">
                <feature.icon className="h-4 w-4" />
              </div>
              <h2 className="text-base font-semibold text-content-primary">{feature.title}</h2>
            </div>
            <p className="mt-4 text-sm leading-7 text-content-secondary">{feature.body}</p>
          </article>
        ))}
      </div>

      <section className="mt-8 rounded-3xl border border-line bg-surface p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand">
              Public Launch Ready
            </p>
            <h3 className="mt-2 text-xl font-semibold text-content-primary">
              Build trust with transparent risk controls and legal coverage.
            </h3>
            <p className="mt-2 text-sm text-content-secondary">
              Terms, privacy, refund, pricing, profile security, and notification preferences are included in-platform.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/pricing"
              className="rounded-xl border border-line px-3.5 py-2 text-sm font-medium text-content-secondary transition-colors hover:bg-surface-muted"
            >
              View pricing
            </Link>
            <Link
              to="/auth"
              className="inline-flex items-center gap-2 rounded-xl bg-brand px-3.5 py-2 text-sm font-semibold text-content-inverse transition-colors hover:bg-brand"
            >
              <Activity className="h-4 w-4" />
              Open platform
            </Link>
          </div>
        </div>
      </section>
    </PublicSiteLayout>
  );
}
