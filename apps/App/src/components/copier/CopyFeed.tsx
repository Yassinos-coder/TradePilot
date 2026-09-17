import { ArrowRight } from 'lucide-react';

import type { CopyEventDTO, CopyOrderStatus } from '@tradepilot/shared';

import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { formatTimestamp } from '@/lib/utils';

const STATUS_TONES: Record<CopyOrderStatus, BadgeTone> = {
  FILLED: 'positive',
  SENT: 'info',
  PENDING: 'warning',
  SKIPPED: 'neutral',
  REJECTED: 'danger',
  FAILED: 'danger',
};

const ACTION_LABELS: Record<CopyEventDTO['action'], string> = {
  OPEN: 'Open',
  CLOSE: 'Close',
  PARTIAL_CLOSE: 'Partial close',
  MODIFY: 'Modify SL/TP',
};

interface CopyFeedProps {
  events: CopyEventDTO[];
}

export function CopyFeed({ events }: CopyFeedProps) {
  if (events.length === 0) {
    return (
      <p className="text-content-tertiary py-8 text-center text-sm">
        No copy activity yet. Trades taken on the master will appear here.
      </p>
    );
  }

  return (
    <ol className="space-y-3">
      {events.map((event) => (
        <li key={event.id} className="border-line-subtle bg-surface-inset rounded-lg border p-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={event.action === 'OPEN' ? 'brand' : 'neutral'}>
              {ACTION_LABELS[event.action]}
            </Badge>
            <span className="text-content-primary text-sm font-semibold">{event.symbol}</span>
            {event.side ? (
              <Badge tone={event.side === 'BUY' ? 'positive' : 'danger'}>{event.side}</Badge>
            ) : null}
            {event.volume ? (
              <span className="text-content-secondary tabular text-xs">
                {event.volume.toFixed(2)} lots
              </span>
            ) : null}
            <span
              className="text-content-tertiary ml-auto text-xs"
              title={`Received ${formatTimestamp(event.createdAt)}`}
            >
              {formatTimestamp(event.masterEventAt)}
            </span>
          </div>

          <ul className="mt-2.5 space-y-1.5">
            {event.orders.map((order) => (
              <li key={order.id} className="flex flex-wrap items-center gap-2 text-xs">
                <ArrowRight className="text-content-tertiary h-3 w-3 shrink-0" />
                <span className="text-content-secondary min-w-0 truncate font-medium">
                  {order.slaveAccountName ?? order.slaveAccountId}
                </span>
                {order.requestedVolume ? (
                  <span className="text-content-tertiary tabular">
                    {order.requestedVolume.toFixed(2)} lots
                  </span>
                ) : null}
                {order.resolvedSymbol && order.resolvedSymbol !== event.symbol ? (
                  <span className="text-content-tertiary">as {order.resolvedSymbol}</span>
                ) : null}
                <Badge tone={STATUS_TONES[order.status]}>{order.status}</Badge>
                {order.skipReason ? (
                  <span className="text-content-tertiary min-w-0 flex-1 truncate">
                    {order.skipReason}
                  </span>
                ) : null}
              </li>
            ))}
            {event.orders.length === 0 ? (
              <li className="text-content-tertiary text-xs">No slave links matched this event.</li>
            ) : null}
          </ul>
        </li>
      ))}
    </ol>
  );
}
