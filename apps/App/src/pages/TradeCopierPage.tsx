import { ArrowRight, Crown, GitBranch, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { Link } from 'react-router-dom';

import { PublicSiteLayout } from '@/components/layout/PublicSiteLayout';
import { TRADE_COPIER_FAQ } from '@/seo/faq';

const STEPS = [
  {
    icon: Crown,
    title: 'Nominate a master account',
    body: 'Attach the TradePilot Expert Advisor to any MT4 or MT5 terminal and mark that account as the master. It reports every position it opens, closes, partially closes or modifies.',
  },
  {
    icon: GitBranch,
    title: 'Link your slave accounts',
    body: 'Each slave account runs the same EA and is connected to the master through a link. One master can feed unlimited slaves, across brokers and across MetaTrader versions.',
  },
  {
    icon: SlidersHorizontal,
    title: 'Set the risk on each link',
    body: 'Every link carries its own sizing mode — fixed lot, multiplier, balance ratio or percent risk — plus lot caps and position limits, so each account takes the exposure you decide.',
  },
  {
    icon: ShieldCheck,
    title: 'Let the guardrails hold the line',
    body: 'Daily loss limits, drawdown ceilings and equity floors are checked before a copy is sent. When a limit is hit the link stops opening new trades — closes are never blocked.',
  },
];

const SIZING_MODES = [
  { mode: 'Fixed lot', use: 'Every copy opens the same lot size regardless of the master.' },
  { mode: 'Multiplier', use: "Copies the master's lot scaled by a factor you set per link." },
  { mode: 'Balance ratio', use: 'Scales exposure by the balance ratio between the two accounts.' },
  { mode: 'Percent risk', use: 'Sizes each copy so the stop loss risks a fixed percent of equity.' },
];

export function TradeCopierPage() {
  return (
    <PublicSiteLayout
      title="What is a trade copier?"
      subtitle="A trade copier mirrors trades from one trading account to others. You place an order once on a master account, and every linked slave account receives the same trade — sized to its own risk rules — within seconds."
    >
      <section className="mb-10">
        <h2 className="text-content-primary text-2xl font-semibold tracking-tight">
          How trade copying works
        </h2>
        <p className="text-content-secondary mt-3 max-w-3xl text-sm leading-7">
          Copy trading between MetaTrader accounts comes down to four moving parts: a master that
          reports what it did, links that decide who receives it, sizing rules that translate one
          lot size into another, and risk limits that decide when a copy should not be sent at all.
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {STEPS.map((step, index) => (
            <article key={step.title} className="border-line bg-surface rounded-3xl border p-6">
              <div className="flex items-center gap-3">
                <div className="bg-brand-subtle text-brand flex h-10 w-10 items-center justify-center rounded-2xl">
                  <step.icon className="h-4 w-4" />
                </div>
                <h3 className="text-content-primary text-base font-semibold">
                  {index + 1}. {step.title}
                </h3>
              </div>
              <p className="text-content-secondary mt-4 text-sm leading-7">{step.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mb-10">
        <h2 className="text-content-primary text-2xl font-semibold tracking-tight">
          Lot sizing modes explained
        </h2>
        <p className="text-content-secondary mt-3 max-w-3xl text-sm leading-7">
          Two accounts rarely deserve the same lot size. A $2,000 account and a $100,000 account
          following the same master need different exposure, which is what sizing modes solve.
        </p>

        <div className="border-line bg-surface mt-6 overflow-hidden rounded-3xl border">
          <table className="w-full text-left text-sm">
            <thead className="border-line bg-surface-muted text-content-tertiary border-b">
              <tr>
                <th scope="col" className="px-5 py-3 font-semibold">
                  Sizing mode
                </th>
                <th scope="col" className="px-5 py-3 font-semibold">
                  What it does
                </th>
              </tr>
            </thead>
            <tbody>
              {SIZING_MODES.map((row) => (
                <tr key={row.mode} className="border-line-subtle border-b last:border-b-0">
                  <td className="text-content-primary px-5 py-3 font-medium">{row.mode}</td>
                  <td className="text-content-secondary px-5 py-3">{row.use}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-10">
        <h2 className="text-content-primary text-2xl font-semibold tracking-tight">
          Copying across brokers and MetaTrader versions
        </h2>
        <p className="text-content-secondary mt-3 max-w-3xl text-sm leading-7">
          Brokers name the same instrument differently — gold might be XAUUSD at one broker, GOLD at
          another, and XAUUSD.pro at a third. Copies are routed through the TradePilot bridge rather
          than through MetaTrader itself, so symbols are remapped per link and an MT4 master can
          copy to MT5 slaves in either direction.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-content-primary text-2xl font-semibold tracking-tight">
          Frequently asked questions
        </h2>

        <div className="mt-6 space-y-3">
          {TRADE_COPIER_FAQ.map((item) => (
            <details
              key={item.question}
              className="border-line bg-surface group rounded-2xl border p-5"
            >
              <summary className="text-content-primary cursor-pointer list-none text-sm font-semibold">
                {item.question}
              </summary>
              <p className="text-content-secondary mt-3 text-sm leading-7">{item.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="border-line bg-surface rounded-3xl border p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-content-primary text-xl font-semibold">
              Start copying trades across your accounts
            </h2>
            <p className="text-content-secondary mt-2 text-sm">
              Connect a master and one slave account for free, then scale up when you need unlimited
              links and the full risk engine.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              to="/pricing"
              className="border-line text-content-secondary hover:bg-surface-muted rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors"
            >
              View pricing
            </Link>
            <Link
              to="/auth"
              className="bg-brand text-brand-fg hover:bg-brand-hover inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors"
            >
              Get started
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </PublicSiteLayout>
  );
}
