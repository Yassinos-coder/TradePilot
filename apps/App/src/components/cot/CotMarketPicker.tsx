import { useMemo } from 'react';

import type { CotMarketDTO } from '@tradepilot/shared';

import { cn } from '@/lib/utils';

interface CotMarketPickerProps {
  markets: CotMarketDTO[];
  value: string;
  group: string;
  onChange: (code: string) => void;
  onGroupChange: (group: string) => void;
}

export function CotMarketPicker({
  markets,
  value,
  group,
  onChange,
  onGroupChange,
}: CotMarketPickerProps) {
  const groups = useMemo(() => [...new Set(markets.map((market) => market.group))], [markets]);
  const visible = markets.filter((market) => market.group === group);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-content-tertiary mr-1 text-xs font-medium">Asset class</span>
        {groups.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => onGroupChange(name)}
            className={cn(
              'cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              name === group
                ? 'border-brand bg-brand-subtle text-content-primary'
                : 'border-line text-content-tertiary hover:bg-surface-muted',
            )}
          >
            {name}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-content-tertiary mr-1 text-xs font-medium">Contract</span>
        {visible.map((market) => (
          <button
            key={market.code}
            type="button"
            onClick={() => onChange(market.code)}
            title={`${market.exchange} · ${market.contractUnit}`}
            className={cn(
              'cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              market.code === value
                ? 'border-brand bg-brand text-brand-fg'
                : 'border-line text-content-secondary hover:bg-surface-muted',
            )}
          >
            {market.label}
            {market.symbol ? (
              <span
                className={cn(
                  'ml-1.5 text-[10px]',
                  market.code === value ? 'text-brand-fg/70' : 'text-content-tertiary',
                )}
              >
                {market.symbol}
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}
