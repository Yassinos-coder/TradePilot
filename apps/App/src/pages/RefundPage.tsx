import { PublicSiteLayout } from '../components/layout/PublicSiteLayout';

const RULES = [
  'Subscriptions can be cancelled at any time.',
  'Refund decisions are discretionary and evaluated case-by-case.',
  'Refunds are not guaranteed, including for periods where the platform was accessible but not used.',
];

export function RefundPage() {
  return (
    <PublicSiteLayout
      title="Refund Policy"
      subtitle="This policy outlines cancellation and refund handling for TradePilot subscriptions."
    >
      <article className="rounded-3xl border border-slate-200/80 bg-white/90 p-6 dark:border-slate-800 dark:bg-slate-900/90">
        <ol className="space-y-3 text-sm leading-7 text-slate-700 dark:text-slate-300">
          {RULES.map((rule, index) => (
            <li key={rule}>
              <span className="font-semibold text-slate-950 dark:text-white">{index + 1}. </span>
              {rule}
            </li>
          ))}
        </ol>
      </article>
    </PublicSiteLayout>
  );
}
