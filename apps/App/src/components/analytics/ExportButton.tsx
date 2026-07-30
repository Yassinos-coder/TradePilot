import { useState, useRef } from 'react';
import { Download, ChevronDown } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

import type { AnalyticsSummaryDTO } from '@tradepilot/shared';

import { cn } from '@/lib/utils';

interface ExportButtonProps {
  analytics: AnalyticsSummaryDTO;
}

function formatAsText(a: AnalyticsSummaryDTO): string {
  const lines: string[] = [
    '=== TradePilot Analytics Export ===',
    '',
    `Net Profit:         $${a.netProfit.toFixed(2)}`,
    `Win Rate:           ${a.winRate.toFixed(2)}%`,
    `Total Trades:       ${a.totalTrades}`,
    `Wins:               ${a.wins}`,
    `Losses:             ${a.losses}`,
    `Profit Factor:      ${a.profitFactor?.toFixed(2) ?? 'N/A'}`,
    `Avg Win:            $${a.avgWin?.toFixed(2) ?? 'N/A'}`,
    `Avg Loss:           $${a.avgLoss?.toFixed(2) ?? 'N/A'}`,
    `Max Drawdown:       ${a.maxDrawdownPercent?.toFixed(2) ?? 'N/A'}%`,
    `Sharpe Ratio:       ${a.sharpeRatio?.toFixed(2) ?? 'N/A'}`,
    `Calmar Ratio:       ${a.calmarRatio?.toFixed(2) ?? 'N/A'}`,
    `Sortino Ratio:      ${a.sortinoRatio?.toFixed(2) ?? 'N/A'}`,
    '',
    '--- Symbol Breakdown ---',
    ...(a.bySymbol ?? []).map((s) => `  ${s.symbol}: ${s.trades} trades, $${s.netProfit.toFixed(2)}`),
  ];
  return lines.join('\n');
}

function download(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ExportButton({ analytics }: ExportButtonProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const handle = (action: () => void) => {
    action();
    setOpen(false);
  };

  const options = [
    {
      label: 'Copy as Text',
      action: () => navigator.clipboard.writeText(formatAsText(analytics)),
    },
    {
      label: 'Copy as JSON',
      action: () => navigator.clipboard.writeText(JSON.stringify(analytics, null, 2)),
    },
    {
      label: 'Download as Text',
      action: () => download(formatAsText(analytics), 'tradepilot-analytics.txt', 'text/plain'),
    },
    {
      label: 'Download as JSON',
      action: () => download(JSON.stringify(analytics, null, 2), 'tradepilot-analytics.json', 'application/json'),
    },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-2 text-xs font-medium text-content-secondary shadow-sm transition-colors hover:bg-surface-muted"
      >
        <Download className="h-3.5 w-3.5" />
        Export
        <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-full z-50 mt-1 w-44 overflow-hidden rounded-xl border border-line bg-surface shadow-lg"
          >
            {options.map((opt) => (
              <button
                key={opt.label}
                type="button"
                onClick={() => handle(opt.action)}
                className="w-full px-4 py-2.5 text-left text-xs font-medium text-content-secondary transition-colors hover:bg-surface-muted"
              >
                {opt.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
