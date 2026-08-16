import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

import { TradePilotLogo } from '@/components/brand/TradePilotLogo';

const FOOTER_LINKS = [
  { to: '/trade-copier', label: 'Trade copier guide' },
  { to: '/pricing', label: 'Pricing' },
  { to: '/terms', label: 'Terms' },
  { to: '/privacy', label: 'Privacy' },
  { to: '/refund', label: 'Refund' },
] as const;

export function PublicSiteLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="bg-canvas relative min-h-screen">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,var(--color-brand-subtle),transparent_38%)]"
      />
      <header className="border-line bg-surface relative border-b pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <Link to="/" aria-label="TradePilot home">
            <TradePilotLogo showTagline={false} />
          </Link>
          <div className="flex items-center gap-2">
            <Link
              to="/trade-copier"
              className="text-content-secondary hover:bg-surface-muted hover:text-content-primary focus-visible:ring-brand hidden rounded-xl px-3 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none sm:inline-flex"
            >
              Trade copier
            </Link>
            <Link
              to="/pricing"
              className="text-content-secondary hover:bg-surface-muted hover:text-content-primary focus-visible:ring-brand rounded-xl px-3 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
            >
              Pricing
            </Link>
            <Link
              to="/auth"
              className="bg-brand text-brand-fg hover:bg-brand-hover focus-visible:ring-brand focus-visible:ring-offset-canvas inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold shadow-sm transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              Open app
              <ArrowRight aria-hidden className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      <main id="main" className="relative mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <div className="mb-8">
          <h1 className="text-content-primary text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            {title}
          </h1>
          <p className="text-content-secondary mt-3 max-w-3xl text-sm leading-7 text-pretty">
            {subtitle}
          </p>
        </div>
        {children}
      </main>

      <footer className="border-line bg-surface relative border-t pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-5 text-xs text-content-tertiary sm:px-6">
          <p>© {new Date().getFullYear()} TradePilot. All rights reserved.</p>
          <div className="flex flex-wrap items-center gap-4">
            {FOOTER_LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="hover:text-content-primary focus-visible:ring-brand rounded transition-colors focus-visible:ring-2 focus-visible:outline-none"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
