import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { TradePilotLogo } from '../brand/TradePilotLogo';

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
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.14),_transparent_35%),linear-gradient(180deg,#f6fbff_0%,#f8fafc_100%)]">
      <header className="border-b border-line bg-surface backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <Link to="/" aria-label="TradePilot home">
            <TradePilotLogo showTagline={false} />
          </Link>
          <div className="flex items-center gap-2">
            <Link
              to="/pricing"
              className="rounded-xl px-3 py-2 text-sm font-medium text-content-secondary transition-colors hover:bg-surface-muted hover:text-content-primary"
            >
              Pricing
            </Link>
            <Link
              to="/auth"
              className="inline-flex items-center gap-2 rounded-xl bg-brand px-3.5 py-2 text-sm font-semibold text-content-inverse shadow-sm transition-colors hover:bg-brand"
            >
              Open app
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight text-content-primary sm:text-4xl">
            {title}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-content-secondary">
            {subtitle}
          </p>
        </div>
        {children}
      </main>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-5 text-xs text-content-tertiary sm:px-6">
          <p>© {new Date().getFullYear()} TradePilot. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <Link to="/terms" className="hover:text-content-primary">
              Terms
            </Link>
            <Link to="/privacy" className="hover:text-content-primary">
              Privacy
            </Link>
            <Link to="/refund" className="hover:text-content-primary">
              Refund
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
