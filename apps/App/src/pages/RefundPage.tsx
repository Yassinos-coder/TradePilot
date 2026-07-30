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
      <article className="rounded-3xl border border-line bg-surface p-6">
        <ol className="space-y-3 text-sm leading-7 text-content-secondary">
          {RULES.map((rule, index) => (
            <li key={rule}>
              <span className="font-semibold text-content-primary">{index + 1}. </span>
              {rule}
            </li>
          ))}
        </ol>
      </article>
    </PublicSiteLayout>
  );
}
