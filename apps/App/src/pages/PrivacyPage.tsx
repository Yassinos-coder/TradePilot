import { PublicSiteLayout } from '../components/layout/PublicSiteLayout';

const ITEMS = [
  'We collect account identity data (email, profile details), execution telemetry, and platform activity required to provide service functionality.',
  'API keys are stored only as irreversible SHA-256 hashes; the plaintext secret is shown once at creation and never retained.',
  'Trading telemetry from your connected terminals (positions, balances, execution results) is processed to operate the copier and produce your analytics.',
  'We apply access controls and infrastructure safeguards intended to protect stored user data.',
  'We do not sell personal data to third parties.',
  'Data may be processed by infrastructure vendors required to operate the service (for example hosting, database, and email providers).',
];

export function PrivacyPage() {
  return (
    <PublicSiteLayout
      title="Privacy Policy"
      subtitle="This policy explains what TradePilot collects and how that data is used."
    >
      <article className="rounded-3xl border border-line bg-surface p-6">
        <ul className="space-y-3 text-sm leading-7 text-content-secondary">
          {ITEMS.map((item) => (
            <li key={item}>- {item}</li>
          ))}
        </ul>
      </article>
    </PublicSiteLayout>
  );
}
