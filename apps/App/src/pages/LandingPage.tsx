import { Activity, ArrowRight, BarChart3, Check, ShieldCheck, Signal, Workflow } from 'lucide-react';
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
      <section className="mb-10 overflow-hidden rounded-3xl border border-emerald-400/20 bg-[#07110f] px-6 py-8 text-white shadow-2xl shadow-emerald-950/10 sm:px-10 sm:py-10">
        <div className="grid items-center gap-8 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">Built for serious MetaTrader operators</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Copy trades. Control risk. Scale smarter.</h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300">One execution layer for MT4 and MT5 accounts, with real-time copying and risk rules that adapt to every account in your setup.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/auth" className="inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-emerald-950 transition-colors hover:bg-emerald-300">Start with TradePilot <ArrowRight className="h-4 w-4" /></Link>
              <Link to="/pricing" className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/5">See pricing</Link>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            {['Real-time MT4 & MT5 bridge', 'Independent risk per account', 'Execution history and analytics'].map((item) => (
              <div key={item} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-400/15"><Check className="h-3.5 w-3.5 text-emerald-300" /></span>
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

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
              Professional trading infrastructure
            </p>
            <h3 className="mt-2 text-xl font-semibold text-content-primary">
              Your strategy stays yours. TradePilot handles the execution layer.
            </h3>
            <p className="mt-2 text-sm text-content-secondary">
              Connect your MetaTrader accounts, define the risk each one can take, and monitor every copied execution from one focused workspace.
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
