import { ArrowUpRight, Download } from 'lucide-react';
import { Link } from 'react-router-dom';

export function DownloadEaBanner() {
  return (
    <Link
      to="/app/tools"
      className="rounded-card border-brand/30 bg-brand-subtle hover:border-brand/50 group block border p-4 shadow-card transition-colors"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="bg-brand text-brand-fg inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
            <Download className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-content-primary text-sm font-semibold">Download the TradePilot EA</p>
            <p className="text-content-secondary text-xs">
              Get the MT4/MT5 Expert Advisor to start copying trades — click here
            </p>
          </div>
        </div>
        <span className="text-brand inline-flex shrink-0 items-center gap-1 text-sm font-semibold">
          Go to Tools
          <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </span>
      </div>
    </Link>
  );
}
