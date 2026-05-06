import { PublicSiteLayout } from '../components/layout/PublicSiteLayout';

const ITEMS = [
  'We collect account identity data (email, profile details), execution telemetry, and platform activity required to provide service functionality.',
  'When Telegram is connected, message metadata and selected channel content are processed to classify, parse, and route trading instructions.',
  'Sensitive integration data such as Telegram session material is stored in encrypted form on the server side.',
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
      <article className="rounded-3xl border border-slate-200/80 bg-white/90 p-6 dark:border-slate-800 dark:bg-slate-900/90">
        <ul className="space-y-3 text-sm leading-7 text-slate-700 dark:text-slate-300">
          {ITEMS.map((item) => (
            <li key={item}>- {item}</li>
          ))}
        </ul>
      </article>
    </PublicSiteLayout>
  );
}
