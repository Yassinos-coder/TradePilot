import { CandlestickChart, CheckCircle2, Download, ShieldCheck } from 'lucide-react';

import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';

interface EaDownload {
  platform: string;
  fileName: string;
  href: string;
  available: boolean;
}

const DOWNLOADS: EaDownload[] = [
  {
    platform: 'MetaTrader 5',
    fileName: 'TradePilot_EA_MT5.ex5',
    href: '/downloads/TradePilot_EA_MT5.ex5',
    available: true,
  },
  {
    platform: 'MetaTrader 4',
    fileName: 'TradePilot_EA_MT4.ex4',
    href: '/downloads/TradePilot_EA_MT4.ex4',
    available: false,
  },
];

const INSTALL_STEPS = [
  'Download the file for your MetaTrader platform below.',
  'Copy it into the terminal’s MQL4/Experts or MQL5/Experts folder (File → Open Data Folder in MetaTrader).',
  'Restart MetaTrader, then drag the EA onto any chart.',
  'In Tools → Options → Expert Advisors, enable "Allow automated trading" and "Allow DLL imports".',
  'Paste your EA key from Settings → API & Keys into the EA’s inputs and click OK.',
];

function DownloadCard({ download }: { download: EaDownload }) {
  return (
    <Card
      eyebrow={download.platform}
      title="TradePilot EA"
      description="Compiled build — ready to attach to a chart, no source code included."
      actions={
        download.available ? (
          <Badge tone="positive" dot>
            Available
          </Badge>
        ) : (
          <Badge tone="neutral">Coming soon</Badge>
        )
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="bg-surface-muted text-content-secondary inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
            <CandlestickChart className="h-5 w-5" />
          </span>
          <div>
            <p className="text-content-primary text-sm font-medium">{download.fileName}</p>
            <p className="text-content-tertiary text-xs">Compiled binary</p>
          </div>
        </div>

        {download.available ? (
          <a
            href={download.href}
            download
            className="bg-brand text-brand-fg hover:bg-brand-hover active:bg-brand-active inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold shadow-sm transition-colors focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-canvas focus-visible:outline-none"
          >
            <Download className="h-4 w-4" />
            Download
          </a>
        ) : (
          <span className="bg-surface-muted text-content-tertiary inline-flex h-9 shrink-0 cursor-not-allowed items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold">
            <Download className="h-4 w-4" />
            Download
          </span>
        )}
      </div>
    </Card>
  );
}

export function ToolsPage() {
  return (
    <div className="space-y-6">
      <Card
        eyebrow="TradePilot EA"
        title="Get the Expert Advisor"
        description="These are the compiled MetaTrader binaries we distribute — the EA source code is not included."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {DOWNLOADS.map((download) => (
            <DownloadCard key={download.platform} download={download} />
          ))}
        </div>
      </Card>

      <Card title="Installation" eyebrow="Setup" description="Get the EA running in a few steps.">
        <ol className="space-y-3">
          {INSTALL_STEPS.map((step, index) => (
            <li key={step} className="flex items-start gap-3">
              <span className="bg-brand-subtle text-brand mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold">
                {index + 1}
              </span>
              <span className="text-content-secondary text-sm leading-6">{step}</span>
            </li>
          ))}
        </ol>
      </Card>

      <Card title="Good to know" eyebrow="Notes">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-start gap-3">
            <ShieldCheck className="text-brand mt-0.5 h-5 w-5 shrink-0" />
            <p className="text-content-secondary text-sm leading-6">
              These builds are compiled and signed for distribution — the underlying source is kept
              private.
            </p>
          </div>
          <div className="flex items-start gap-3">
            <CheckCircle2 className="text-brand mt-0.5 h-5 w-5 shrink-0" />
            <p className="text-content-secondary text-sm leading-6">
              Works as a master account (reports trades) or a slave account (executes copies), depending
              on how you set it up in Trade Copier.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
