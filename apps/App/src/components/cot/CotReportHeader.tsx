import type { CotReportDTO } from '@tradepilot/shared';

import { CotChangeChip } from './CotChangeChip';
import { formatContracts, formatReportDate } from './cotFormat';

interface CotReportHeaderProps {
  report: CotReportDTO;
}

export function CotReportHeader({ report }: CotReportHeaderProps) {
  const { market } = report;

  return (
    <div className="border-line bg-surface rounded-card border p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-content-primary text-lg font-semibold tracking-tight">
            {market.label}
            {market.symbol ? (
              <span className="text-content-tertiary ml-2 text-sm font-medium">{market.symbol}</span>
            ) : null}
          </h2>
          <p className="text-content-secondary mt-0.5 text-sm">
            {market.exchange} · contracts of {market.contractUnit}
          </p>
        </div>

        <div className="text-right">
          <p className="text-content-tertiary text-xs font-medium">As of</p>
          <p className="text-content-primary text-sm font-semibold">
            {formatReportDate(report.reportDate)}
          </p>
        </div>
      </div>

      <div className="border-line-subtle mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t pt-3">
        <span className="text-content-tertiary text-xs">
          CFTC code <span className="text-content-secondary font-semibold">#{market.code}</span>
        </span>
        <span className="text-content-tertiary text-xs">
          Open interest{' '}
          <span className="text-content-primary tabular font-semibold">
            {formatContracts(report.openInterest)}
          </span>
        </span>
        <span className="text-content-tertiary flex items-center gap-1.5 text-xs">
          Weekly change
          <CotChangeChip value={report.openInterestChange} />
        </span>
        {report.totalTraders === null ? null : (
          <span className="text-content-tertiary text-xs">
            Total traders{' '}
            <span className="text-content-primary tabular font-semibold">
              {formatContracts(report.totalTraders)}
            </span>
          </span>
        )}
      </div>
    </div>
  );
}
