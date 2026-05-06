import { Activity, BarChart3, ShieldCheck, Signal, Workflow } from 'lucide-react';
import { Link } from 'react-router-dom';

import { PublicSiteLayout } from '../components/layout/PublicSiteLayout';

const FEATURES = [
  {
    icon: Signal,
    title: 'Telegram signal ingestion',
    body: 'Realtime + backfill message processing with parser confidence, classification, and execution audit logs.',
  },
  {
    icon: Workflow,
    title: 'Multi-account execution router',
    body: 'Routes validated signals to connected MT4/MT5 EAs with symbol resolution per account and strict dispatch acknowledgement.',
  },
  {
    icon: ShieldCheck,
    title: 'Risk + failsafe guardrails',
    body: 'Daily loss limits, trade pacing limits, low-margin checks, and disconnect failsafes to pause unsafe execution.',
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
      title="Institutional-grade copy execution for Telegram trading desks"
      subtitle="TradePilot is automation software for ingesting Telegram trade ideas, validating signals, dispatching to MetaTrader EAs, and monitoring execution quality with production observability."
    >
      <div className="grid gap-4 md:grid-cols-2">
        {FEATURES.map((feature) => (
          <article
            key={feature.title}
            className="rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/90"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">
                <feature.icon className="h-4 w-4" />
              </div>
              <h2 className="text-base font-semibold text-slate-950 dark:text-white">{feature.title}</h2>
            </div>
            <p className="mt-4 text-sm leading-7 text-slate-600 dark:text-slate-300">{feature.body}</p>
          </article>
        ))}
      </div>

      <section className="mt-8 rounded-3xl border border-slate-200/80 bg-white/90 p-6 dark:border-slate-800 dark:bg-slate-900/90">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-600 dark:text-sky-400">
              Public Launch Ready
            </p>
            <h3 className="mt-2 text-xl font-semibold text-slate-950 dark:text-white">
              Build trust with transparent risk controls and legal coverage.
            </h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Terms, privacy, refund, pricing, profile security, and notification preferences are included in-platform.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/pricing"
              className="rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              View pricing
            </Link>
            <Link
              to="/auth"
              className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky-700"
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
