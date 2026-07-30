import type { CopierRiskParams, SizingMode, SymbolFilterMode } from '@tradepilot/shared';

import { Alert } from '@/components/ui/Alert';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Toggle } from '@/components/ui/Toggle';

const SIZING_MODES: Array<{ value: SizingMode; label: string; hint: string }> = [
  {
    value: 'MULTIPLIER',
    label: 'Multiplier',
    hint: "Slave lot = master lot × multiplier. Predictable and doesn't need equity data.",
  },
  {
    value: 'FIXED_LOT',
    label: 'Fixed lot',
    hint: 'Every copied trade uses the same lot size, whatever the master traded.',
  },
  {
    value: 'BALANCE_RATIO',
    label: 'Balance ratio',
    hint: 'Scales by slave equity ÷ master equity, so both accounts risk the same share.',
  },
  {
    value: 'RISK_PERCENT',
    label: 'Risk percent',
    hint: 'Sizes from the stop-loss distance. Falls back to Multiplier when the master sends no SL.',
  },
];

const SYMBOL_FILTER_MODES: Array<{ value: SymbolFilterMode; label: string }> = [
  { value: 'ALL', label: 'Copy every symbol' },
  { value: 'ALLOWLIST', label: 'Only these symbols' },
  { value: 'BLOCKLIST', label: 'Everything except these' },
];

interface RiskParamsFormProps {
  value: CopierRiskParams;
  onChange: (next: CopierRiskParams) => void;
}

export function RiskParamsForm({ value, onChange }: RiskParamsFormProps) {
  const patch = (changes: Partial<CopierRiskParams>) => onChange({ ...value, ...changes });

  const numberField = (raw: string, fallback: number) => {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const nullableNumberField = (raw: string) => {
    if (!raw.trim()) {
      return null;
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const activeMode = SIZING_MODES.find((mode) => mode.value === value.sizingMode);

  return (
    <div className="space-y-7">
      <section className="space-y-3">
        <h3 className="text-content-primary text-sm font-semibold">Position sizing</h3>
        <Select
          label="Sizing mode"
          value={value.sizingMode}
          options={SIZING_MODES.map((mode) => ({ value: mode.value, label: mode.label }))}
          onChange={(event) => patch({ sizingMode: event.target.value as SizingMode })}
        />
        {activeMode ? (
          <Alert tone="info">{activeMode.hint}</Alert>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {value.sizingMode === 'MULTIPLIER' || value.sizingMode === 'BALANCE_RATIO' ? (
            <Input
              type="number"
              step="0.01"
              min="0.01"
              label="Lot multiplier"
              value={String(value.lotMultiplier)}
              onChange={(event) =>
                patch({ lotMultiplier: numberField(event.target.value, value.lotMultiplier) })
              }
              hint={
                value.sizingMode === 'BALANCE_RATIO'
                  ? 'Used as the fallback when equity data is missing'
                  : undefined
              }
            />
          ) : null}

          {value.sizingMode === 'FIXED_LOT' ? (
            <Input
              type="number"
              step="0.01"
              min="0.01"
              label="Fixed lot"
              value={value.fixedLot === null ? '' : String(value.fixedLot)}
              onChange={(event) => patch({ fixedLot: nullableNumberField(event.target.value) })}
              error={value.fixedLot === null ? 'Required for fixed-lot sizing' : undefined}
            />
          ) : null}

          {value.sizingMode === 'RISK_PERCENT' ? (
            <Input
              type="number"
              step="0.01"
              min="0.01"
              label="Risk per trade (%)"
              value={value.riskPercent === null ? '' : String(value.riskPercent)}
              onChange={(event) => patch({ riskPercent: nullableNumberField(event.target.value) })}
              error={value.riskPercent === null ? 'Required for risk-percent sizing' : undefined}
            />
          ) : null}

          <Input
            type="number"
            step="0.01"
            min="0.01"
            label="Min lot"
            value={String(value.minLot)}
            onChange={(event) => patch({ minLot: numberField(event.target.value, value.minLot) })}
          />
          <Input
            type="number"
            step="0.01"
            min="0.01"
            label="Max lot"
            value={String(value.maxLot)}
            onChange={(event) => patch({ maxLot: numberField(event.target.value, value.maxLot) })}
            error={value.maxLot < value.minLot ? 'Must be at least the min lot' : undefined}
            hint="Hard ceiling — every computed size is clamped to this"
          />
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-content-primary text-sm font-semibold">Risk limits</h3>
        <p className="text-content-tertiary text-xs leading-5">
          These apply to this slave account only, and only when opening new exposure — a close is
          never blocked.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            type="number"
            min="1"
            label="Max open positions"
            value={String(value.maxOpenPositions)}
            onChange={(event) =>
              patch({ maxOpenPositions: numberField(event.target.value, value.maxOpenPositions) })
            }
          />
          <Input
            type="number"
            step="0.1"
            min="0.1"
            label="Max daily loss (%)"
            value={String(value.maxDailyLossPercent)}
            onChange={(event) =>
              patch({
                maxDailyLossPercent: numberField(event.target.value, value.maxDailyLossPercent),
              })
            }
          />
          <Input
            type="number"
            step="0.1"
            min="0.1"
            label="Max drawdown (%)"
            value={String(value.maxDrawdownPercent)}
            onChange={(event) =>
              patch({
                maxDrawdownPercent: numberField(event.target.value, value.maxDrawdownPercent),
              })
            }
          />
          <Input
            type="number"
            step="0.01"
            min="0"
            label="Equity floor"
            value={value.equityFloor === null ? '' : String(value.equityFloor)}
            onChange={(event) => patch({ equityFloor: nullableNumberField(event.target.value) })}
            hint="Stop copying below this equity. Blank to disable."
          />
          <Input
            type="number"
            min="0"
            label="Max slippage (points)"
            value={String(value.maxSlippagePoints)}
            onChange={(event) =>
              patch({ maxSlippagePoints: numberField(event.target.value, value.maxSlippagePoints) })
            }
          />
          <Input
            type="number"
            min="0"
            label="Max copy delay (ms)"
            value={String(value.maxCopyDelayMs)}
            onChange={(event) =>
              patch({ maxCopyDelayMs: numberField(event.target.value, value.maxCopyDelayMs) })
            }
            hint="Skip a copy that arrives later than this. 0 to never skip."
          />
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-content-primary text-sm font-semibold">What to copy</h3>
        <div className="grid gap-2.5">
          <Toggle
            label="Copy stop loss"
            description="Mirror the master's stop-loss level onto the slave."
            checked={value.copyStopLoss}
            onCheckedChange={(next) => patch({ copyStopLoss: next })}
          />
          <Toggle
            label="Copy take profit"
            description="Mirror the master's take-profit level onto the slave."
            checked={value.copyTakeProfit}
            onCheckedChange={(next) => patch({ copyTakeProfit: next })}
          />
          <Toggle
            label="Copy closes"
            description="Close the slave position when the master closes. Leave on unless you manage exits yourself."
            checked={value.copyCloses}
            onCheckedChange={(next) => patch({ copyCloses: next })}
          />
          <Toggle
            label="Copy partial closes"
            description="Mirror partial closes proportionally."
            checked={value.copyPartialCloses}
            onCheckedChange={(next) => patch({ copyPartialCloses: next })}
          />
          <Toggle
            label="Copy SL/TP changes"
            description="Mirror stop-loss and take-profit modifications made after entry."
            checked={value.copyModifications}
            onCheckedChange={(next) => patch({ copyModifications: next })}
          />
          <Toggle
            label="Reverse copy"
            description="Invert direction: a master BUY opens a SELL on this slave."
            checked={value.reverseCopy}
            onCheckedChange={(next) => patch({ reverseCopy: next })}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-content-primary text-sm font-semibold">Symbols</h3>
        <Select
          label="Symbol filter"
          value={value.symbolFilterMode}
          options={SYMBOL_FILTER_MODES.map((mode) => ({ value: mode.value, label: mode.label }))}
          onChange={(event) =>
            patch({ symbolFilterMode: event.target.value as SymbolFilterMode })
          }
        />
        {value.symbolFilterMode !== 'ALL' ? (
          <Input
            label="Symbols"
            value={value.symbolFilter.join(', ')}
            onChange={(event) =>
              patch({
                symbolFilter: event.target.value
                  .split(',')
                  .map((symbol) => symbol.trim().toUpperCase())
                  .filter(Boolean),
              })
            }
            placeholder="XAUUSD, EURUSD"
            hint="Comma separated"
          />
        ) : null}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Symbol prefix"
            value={value.symbolPrefix ?? ''}
            onChange={(event) => patch({ symbolPrefix: event.target.value || null })}
            placeholder="e.g. m"
          />
          <Input
            label="Symbol suffix"
            value={value.symbolSuffix ?? ''}
            onChange={(event) => patch({ symbolSuffix: event.target.value || null })}
            placeholder="e.g. .pro"
          />
        </div>
        <Alert tone="neutral">
          Leave both blank to auto-match the broker's own spelling from the symbols the EA reports.
          Set them only when this broker uses affixes, e.g. <code>XAUUSD.pro</code>.
        </Alert>
      </section>
    </div>
  );
}
