import { PublicSiteLayout } from '../components/layout/PublicSiteLayout';

const CLAUSES = [
  'TradePilot is automation software for processing trading instructions. It does not provide financial, investment, legal, or tax advice.',
  'No returns are guaranteed. Any historical examples or analytics shown in the platform are informational only and do not predict future outcomes.',
  'You are solely responsible for all trading decisions, account configuration, risk settings, and resulting profits or losses.',
  'TradePilot is not a broker and does not hold client funds, execute broker-side custody, or provide discretionary portfolio management.',
  'Platform availability, third-party connectivity, and message delivery are not guaranteed. Outages, latency, and integration failures may occur.',
  'To the maximum extent permitted by law, TradePilot and its operators are not liable for direct or indirect trading losses, missed opportunities, or consequential damages.',
  'You must comply with your broker, exchange, jurisdictional, and data-protection obligations when using the platform.',
];

export function TermsPage() {
  return (
    <PublicSiteLayout
      title="Terms of Service"
      subtitle="These terms govern your access to and use of TradePilot automation software."
    >
      <article className="rounded-3xl border border-line bg-surface p-6">
        <ol className="space-y-3 text-sm leading-7 text-content-secondary">
          {CLAUSES.map((clause, index) => (
            <li key={clause}>
              <span className="font-semibold text-content-primary">{index + 1}. </span>
              {clause}
            </li>
          ))}
        </ol>
      </article>
    </PublicSiteLayout>
  );
}
