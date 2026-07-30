import { Pencil, Trash2, Wifi, WifiOff } from 'lucide-react';

import type { CopierLinkDTO } from '@tradepilot/shared';

import { Badge } from '@/components/ui/Badge';
import { Switch } from '@/components/ui/Toggle';
import { formatTimestamp } from '@/lib/utils';

function describeSizing(link: CopierLinkDTO) {
  switch (link.sizingMode) {
    case 'FIXED_LOT':
      return `Fixed ${link.fixedLot ?? 0} lots`;
    case 'BALANCE_RATIO':
      return 'Balance ratio';
    case 'RISK_PERCENT':
      return `${link.riskPercent ?? 0}% risk per trade`;
    case 'MULTIPLIER':
    default:
      return `${link.lotMultiplier}× master lot`;
  }
}

interface CopierLinkCardProps {
  link: CopierLinkDTO;
  onEdit: (link: CopierLinkDTO) => void;
  onToggle: (link: CopierLinkDTO, enabled: boolean) => void;
  onDelete: (link: CopierLinkDTO) => void;
  isBusy?: boolean;
}

export function CopierLinkCard({
  link,
  onEdit,
  onToggle,
  onDelete,
  isBusy = false,
}: CopierLinkCardProps) {
  const stats: Array<{ label: string; value: string }> = [
    { label: 'Sizing', value: describeSizing(link) },
    { label: 'Lot range', value: `${link.minLot} – ${link.maxLot}` },
    { label: 'Max positions', value: String(link.maxOpenPositions) },
    { label: 'Daily loss cap', value: `${link.maxDailyLossPercent}%` },
    { label: 'Drawdown cap', value: `${link.maxDrawdownPercent}%` },
    { label: 'Copies today', value: String(link.copiesToday) },
  ];

  return (
    <div className="border-line bg-surface rounded-card border p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-content-primary truncate text-sm font-semibold">
              {link.slaveAccountName ?? 'Unnamed account'}
            </h3>
            {link.slaveAccountOnline ? (
              <Badge tone="positive" dot pulse>
                <Wifi className="h-3 w-3" />
                Online
              </Badge>
            ) : (
              <Badge tone="neutral" dot>
                <WifiOff className="h-3 w-3" />
                Offline
              </Badge>
            )}
            {link.reverseCopy ? <Badge tone="warning">Reversed</Badge> : null}
          </div>
          <p className="text-content-tertiary mt-1 text-xs">
            {link.lastCopyAt
              ? `Last copy ${formatTimestamp(link.lastCopyAt)}`
              : 'No copies yet'}
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <Switch
            checked={link.enabled}
            disabled={isBusy}
            onCheckedChange={(next) => onToggle(link, next)}
            label={`${link.enabled ? 'Disable' : 'Enable'} copying to ${link.slaveAccountName ?? 'this account'}`}
          />
          <button
            type="button"
            onClick={() => onEdit(link)}
            aria-label="Edit risk parameters"
            className="text-content-tertiary hover:bg-surface-muted hover:text-content-primary cursor-pointer rounded-lg p-2 transition-colors"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(link)}
            aria-label="Remove link"
            className="text-content-tertiary hover:bg-negative-subtle hover:text-negative-content cursor-pointer rounded-lg p-2 transition-colors"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <dl className="border-line-subtle mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t pt-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <div key={stat.label}>
            <dt className="text-content-tertiary text-[11px] font-medium">{stat.label}</dt>
            <dd className="text-content-primary tabular mt-0.5 text-sm font-semibold">
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>

      {!link.enabled ? (
        <p className="text-content-tertiary mt-3 text-xs">
          Copying is paused for this account. Trades on the master will be recorded but not
          mirrored here.
        </p>
      ) : null}
    </div>
  );
}
