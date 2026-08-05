import { useMemo, useState } from 'react';
import {
  Calculator,
  LineChart,
  Percent,
  PiggyBank,
  Plus,
  RefreshCw,
  Save,
  ShieldAlert,
  Trash2,
} from 'lucide-react';

import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { cn, formatCurrency, formatPercent } from '@/lib/utils';

type CalculatorTab = 'lot-size' | 'pip-value' | 'compound' | 'risk-of-ruin' | 'margin';
type RiskMode = 'percent' | 'money';
type AssetClass = 'Forex' | 'Metals' | 'Indices' | 'Crypto' | 'Energy';

type Instrument = {
  symbol: string;
  label: string;
  assetClass: AssetClass;
  contractSize: number;
  pipSize: number;
  quoteToUsd: number;
  typicalSpreadPips?: number;
};

type LotTemplate = {
  id: string;
  name: string;
  stopLossPips: number;
  riskMode: RiskMode;
  riskPercent: number;
  riskMoney: number;
  contractSize: number;
  pipSize: number;
  quoteToUsd: number;
};

const TEMPLATE_KEY = 'tradepilot.calculators.lotTemplates.v1';

const INSTRUMENTS: Instrument[] = [
  { symbol: 'EURUSD', label: 'EUR/USD', assetClass: 'Forex', contractSize: 100_000, pipSize: 0.0001, quoteToUsd: 1, typicalSpreadPips: 0.8 },
  { symbol: 'GBPUSD', label: 'GBP/USD', assetClass: 'Forex', contractSize: 100_000, pipSize: 0.0001, quoteToUsd: 1, typicalSpreadPips: 1.1 },
  { symbol: 'AUDUSD', label: 'AUD/USD', assetClass: 'Forex', contractSize: 100_000, pipSize: 0.0001, quoteToUsd: 1, typicalSpreadPips: 1 },
  { symbol: 'NZDUSD', label: 'NZD/USD', assetClass: 'Forex', contractSize: 100_000, pipSize: 0.0001, quoteToUsd: 1, typicalSpreadPips: 1.2 },
  { symbol: 'USDCAD', label: 'USD/CAD', assetClass: 'Forex', contractSize: 100_000, pipSize: 0.0001, quoteToUsd: 0.73, typicalSpreadPips: 1.3 },
  { symbol: 'USDJPY', label: 'USD/JPY', assetClass: 'Forex', contractSize: 100_000, pipSize: 0.01, quoteToUsd: 0.0068, typicalSpreadPips: 1 },
  { symbol: 'GBPJPY', label: 'GBP/JPY', assetClass: 'Forex', contractSize: 100_000, pipSize: 0.01, quoteToUsd: 0.0068, typicalSpreadPips: 1.8 },
  { symbol: 'GBPCAD', label: 'GBP/CAD', assetClass: 'Forex', contractSize: 100_000, pipSize: 0.0001, quoteToUsd: 0.73, typicalSpreadPips: 1.8 },
  { symbol: 'XAUUSD', label: 'Gold / USD', assetClass: 'Metals', contractSize: 100, pipSize: 0.01, quoteToUsd: 1, typicalSpreadPips: 20 },
  { symbol: 'XAGUSD', label: 'Silver / USD', assetClass: 'Metals', contractSize: 5_000, pipSize: 0.001, quoteToUsd: 1, typicalSpreadPips: 3 },
  { symbol: 'US30', label: 'Dow Jones CFD', assetClass: 'Indices', contractSize: 1, pipSize: 1, quoteToUsd: 1, typicalSpreadPips: 3 },
  { symbol: 'NAS100', label: 'Nasdaq 100 CFD', assetClass: 'Indices', contractSize: 1, pipSize: 1, quoteToUsd: 1, typicalSpreadPips: 1.5 },
  { symbol: 'SPX500', label: 'S&P 500 CFD', assetClass: 'Indices', contractSize: 1, pipSize: 1, quoteToUsd: 1, typicalSpreadPips: 0.6 },
  { symbol: 'BTCUSD', label: 'Bitcoin CFD', assetClass: 'Crypto', contractSize: 1, pipSize: 1, quoteToUsd: 1, typicalSpreadPips: 30 },
  { symbol: 'ETHUSD', label: 'Ethereum CFD', assetClass: 'Crypto', contractSize: 1, pipSize: 0.1, quoteToUsd: 1, typicalSpreadPips: 8 },
  { symbol: 'USOIL', label: 'WTI Oil CFD', assetClass: 'Energy', contractSize: 1_000, pipSize: 0.01, quoteToUsd: 1, typicalSpreadPips: 3 },
];

const TABS: Array<{ id: CalculatorTab; label: string; description: string }> = [
  { id: 'lot-size', label: 'Lot size', description: 'Risk-based volume from stop loss, balance and contract size.' },
  { id: 'pip-value', label: 'Pip value', description: 'Pip value, trade P/L and spread cost by symbol.' },
  { id: 'compound', label: 'Compounding', description: 'Project balance growth with deposits and Monte Carlo paths.' },
  { id: 'risk-of-ruin', label: 'Risk of ruin', description: 'Estimate drawdown/ruin probability from win rate and R:R.' },
  { id: 'margin', label: 'Margin', description: 'Required margin, notional exposure and leverage usage.' },
];

const DEFAULT_INSTRUMENT = INSTRUMENTS[0]!;
const DEFAULT_TAB = TABS[0]!;

function numberValue(value: string | number, fallback = 0) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function money(value: number) {
  return formatCurrency(Number.isFinite(value) ? value : 0);
}

function loadTemplates(): LotTemplate[] {
  try {
    const raw = localStorage.getItem(TEMPLATE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LotTemplate[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveTemplates(templates: LotTemplate[]) {
  localStorage.setItem(TEMPLATE_KEY, JSON.stringify(templates));
}

function LineGraph({
  points,
  label,
  currency = true,
  tone = 'brand',
}: {
  points: number[];
  label: string;
  currency?: boolean;
  tone?: 'brand' | 'positive' | 'negative';
}) {
  const width = 720;
  const height = 220;
  const pad = 18;
  const min = Math.min(...points, 0);
  const max = Math.max(...points, 1);
  const span = max - min || 1;
  const path = points
    .map((point, index) => {
      const x = pad + (index / Math.max(points.length - 1, 1)) * (width - pad * 2);
      const y = height - pad - ((point - min) / span) * (height - pad * 2);
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
  const end = points.at(-1) ?? 0;
  const strokeClass = tone === 'positive' ? 'stroke-positive' : tone === 'negative' ? 'stroke-negative' : 'stroke-brand';

  return (
    <div className="rounded-2xl border border-line-subtle bg-surface-muted p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-content-tertiary">{label}</p>
        <p className="text-sm font-semibold text-content-primary">{currency ? money(end) : end.toFixed(2)}</p>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-56 w-full overflow-visible">
        <line x1={pad} x2={width - pad} y1={height - pad} y2={height - pad} className="stroke-line" strokeWidth="1" />
        <line x1={pad} x2={pad} y1={pad} y2={height - pad} className="stroke-line" strokeWidth="1" />
        <path d={path} fill="none" className={strokeClass} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="flex justify-between text-[11px] text-content-tertiary">
        <span>{currency ? money(min) : min.toFixed(2)}</span>
        <span>{currency ? money(max) : max.toFixed(2)}</span>
      </div>
    </div>
  );
}

function Metric({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'positive' | 'negative' | 'brand' }) {
  return (
    <div className="rounded-2xl border border-line-subtle bg-surface-muted p-4">
      <p className="text-xs font-medium text-content-tertiary">{label}</p>
      <p
        className={cn(
          'mt-2 text-lg font-semibold tabular-nums',
          tone === 'positive' && 'text-positive',
          tone === 'negative' && 'text-negative',
          tone === 'brand' && 'text-brand',
          tone === 'neutral' && 'text-content-primary',
        )}
      >
        {value}
      </p>
    </div>
  );
}

function ToggleButton({ active, children, onClick }: { active: boolean; children: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'cursor-pointer rounded-lg px-3 py-2 text-xs font-semibold transition-colors',
        active ? 'bg-brand text-white' : 'bg-surface-muted text-content-secondary hover:text-content-primary',
      )}
    >
      {children}
    </button>
  );
}

function LotSizeCalculator() {
  const [instrumentSymbol, setInstrumentSymbol] = useState('XAUUSD');
  const instrument = INSTRUMENTS.find((item) => item.symbol === instrumentSymbol) ?? DEFAULT_INSTRUMENT;
  const [balance, setBalance] = useState(2_000);
  const [stopLossPips, setStopLossPips] = useState(50);
  const [riskMode, setRiskMode] = useState<RiskMode>('percent');
  const [riskPercent, setRiskPercent] = useState(1);
  const [riskMoney, setRiskMoney] = useState(100);
  const [contractSize, setContractSize] = useState(instrument.contractSize);
  const [pipSize, setPipSize] = useState(instrument.pipSize);
  const [quoteToUsd, setQuoteToUsd] = useState(instrument.quoteToUsd);
  const [templateName, setTemplateName] = useState('Personal risk');
  const [templates, setTemplates] = useState<LotTemplate[]>(loadTemplates);

  function applyInstrument(symbol: string) {
    const next = INSTRUMENTS.find((item) => item.symbol === symbol) ?? DEFAULT_INSTRUMENT;
    setInstrumentSymbol(next.symbol);
    setContractSize(next.contractSize);
    setPipSize(next.pipSize);
    setQuoteToUsd(next.quoteToUsd);
  }

  const pipValuePerLot = contractSize * pipSize * quoteToUsd;
  const riskAmount = riskMode === 'percent' ? balance * (riskPercent / 100) : riskMoney;
  const rawLots = stopLossPips > 0 && pipValuePerLot > 0 ? riskAmount / (stopLossPips * pipValuePerLot) : 0;
  const roundedLots = Math.floor(rawLots * 100) / 100;
  const actualRisk = roundedLots * stopLossPips * pipValuePerLot;

  function persist(next: LotTemplate[]) {
    setTemplates(next);
    saveTemplates(next);
  }

  function saveTemplate() {
    const next: LotTemplate = {
      id: crypto.randomUUID(),
      name: templateName.trim() || 'Risk template',
      stopLossPips,
      riskMode,
      riskPercent,
      riskMoney,
      contractSize,
      pipSize,
      quoteToUsd,
    };
    persist([next, ...templates].slice(0, 12));
  }

  function applyTemplate(id: string) {
    const template = templates.find((item) => item.id === id);
    if (!template) return;
    setStopLossPips(template.stopLossPips);
    setRiskMode(template.riskMode);
    setRiskPercent(template.riskPercent);
    setRiskMoney(template.riskMoney);
    setContractSize(template.contractSize);
    setPipSize(template.pipSize);
    setQuoteToUsd(template.quoteToUsd);
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
      <Card title="Lot size calculator" eyebrow="Position sizing" description="Calculate volume from stop loss, balance, risk, contract size and pip size.">
        <div className="grid gap-4 md:grid-cols-2">
          <Select label="Instrument" value={instrumentSymbol} onChange={(e) => applyInstrument(e.target.value)} options={INSTRUMENTS.map((item) => ({ value: item.symbol, label: `${item.label} · ${item.assetClass}` }))} />
          <Input label="Account balance" type="number" value={balance} onChange={(e) => setBalance(numberValue(e.target.value))} prefix="$" />
          <Input label="Stop loss" type="number" value={stopLossPips} onChange={(e) => setStopLossPips(numberValue(e.target.value))} suffix="pips" />
          <div className="grid gap-1.5">
            <label className="pl-0.5 text-xs font-medium text-content-secondary">Risk input</label>
            <div className="flex rounded-xl border border-line-strong bg-surface p-1">
              <ToggleButton active={riskMode === 'percent'} onClick={() => setRiskMode('percent')}>Percentage</ToggleButton>
              <ToggleButton active={riskMode === 'money'} onClick={() => setRiskMode('money')}>Dollar amount</ToggleButton>
            </div>
          </div>
          {riskMode === 'percent' ? (
            <Input label="Risk percent" type="number" value={riskPercent} onChange={(e) => setRiskPercent(numberValue(e.target.value))} suffix="%" />
          ) : (
            <Input label="Risk amount" type="number" value={riskMoney} onChange={(e) => setRiskMoney(numberValue(e.target.value))} prefix="$" />
          )}
          <Input label="Contract size" type="number" value={contractSize} onChange={(e) => setContractSize(numberValue(e.target.value))} hint="Forex commonly uses 100,000. XAUUSD often uses 100 oz." />
          <Input label="Pip size" type="number" step="0.00001" value={pipSize} onChange={(e) => setPipSize(numberValue(e.target.value))} />
          <Input label="Quote → USD conversion" type="number" step="0.0001" value={quoteToUsd} onChange={(e) => setQuoteToUsd(numberValue(e.target.value))} hint="Use 1 when quote currency is USD." />
        </div>
      </Card>

      <div className="space-y-5">
        <Card title="Result" eyebrow="Calculated volume">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <Metric label="Suggested lots" value={`${roundedLots.toFixed(2)} lots`} tone="brand" />
            <Metric label="Risk amount" value={money(riskAmount)} tone="negative" />
            <Metric label="Pip value / lot" value={money(pipValuePerLot)} />
            <Metric label="Risk after 0.01 rounding" value={money(actualRisk)} />
          </div>
        </Card>

        <Card title="Templates" eyebrow="Saved presets" description="Save reusable stop-loss/risk/contract settings like Myfxbook presets. Balance stays editable because it changes.">
          <div className="flex gap-2">
            <Input aria-label="Template name" value={templateName} onChange={(e) => setTemplateName(e.target.value)} className="h-9" />
            <button type="button" onClick={saveTemplate} className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-hover">
              <Save className="h-4 w-4" /> Save
            </button>
          </div>
          <div className="mt-4 space-y-2">
            {templates.length === 0 ? <p className="text-sm text-content-tertiary">No templates saved yet.</p> : null}
            {templates.map((template) => (
              <div key={template.id} className="flex items-center justify-between gap-2 rounded-xl border border-line-subtle bg-surface-muted px-3 py-2">
                <button type="button" onClick={() => applyTemplate(template.id)} className="min-w-0 flex-1 cursor-pointer text-left">
                  <p className="truncate text-sm font-medium text-content-primary">{template.name}</p>
                  <p className="text-xs text-content-tertiary">{template.stopLossPips} pips · {template.riskMode === 'percent' ? `${template.riskPercent}%` : money(template.riskMoney)}</p>
                </button>
                <button type="button" aria-label="Delete template" onClick={() => persist(templates.filter((item) => item.id !== template.id))} className="cursor-pointer rounded-lg p-2 text-content-tertiary hover:bg-negative-subtle hover:text-negative">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function PipValueCalculator() {
  const [instrumentSymbol, setInstrumentSymbol] = useState('EURUSD');
  const instrument = INSTRUMENTS.find((item) => item.symbol === instrumentSymbol) ?? DEFAULT_INSTRUMENT;
  const [lots, setLots] = useState(1);
  const [pips, setPips] = useState(25);
  const [contractSize, setContractSize] = useState(instrument.contractSize);
  const [pipSize, setPipSize] = useState(instrument.pipSize);
  const [quoteToUsd, setQuoteToUsd] = useState(instrument.quoteToUsd);

  function applyInstrument(symbol: string) {
    const next = INSTRUMENTS.find((item) => item.symbol === symbol) ?? DEFAULT_INSTRUMENT;
    setInstrumentSymbol(next.symbol);
    setContractSize(next.contractSize);
    setPipSize(next.pipSize);
    setQuoteToUsd(next.quoteToUsd);
  }

  const pipValuePerLot = contractSize * pipSize * quoteToUsd;
  const pipValue = pipValuePerLot * lots;
  const profitLoss = pipValue * pips;
  const spreadCost = pipValue * (instrument.typicalSpreadPips ?? 0);

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_0.9fr]">
      <Card title="Pip value / P&L calculator" eyebrow="Instrument math" description="Use broker-specific contract size and pip size when your broker differs from the defaults.">
        <div className="grid gap-4 md:grid-cols-2">
          <Select label="Instrument" value={instrumentSymbol} onChange={(e) => applyInstrument(e.target.value)} options={INSTRUMENTS.map((item) => ({ value: item.symbol, label: `${item.label} · ${item.assetClass}` }))} />
          <Input label="Lots" type="number" value={lots} onChange={(e) => setLots(numberValue(e.target.value))} />
          <Input label="Pips" type="number" value={pips} onChange={(e) => setPips(numberValue(e.target.value))} />
          <Input label="Contract size" type="number" value={contractSize} onChange={(e) => setContractSize(numberValue(e.target.value))} />
          <Input label="Pip size" type="number" step="0.00001" value={pipSize} onChange={(e) => setPipSize(numberValue(e.target.value))} />
          <Input label="Quote → USD conversion" type="number" step="0.0001" value={quoteToUsd} onChange={(e) => setQuoteToUsd(numberValue(e.target.value))} />
        </div>
      </Card>
      <Card title="Result" eyebrow="Trade value">
        <div className="grid gap-3 sm:grid-cols-2">
          <Metric label="Pip value / 1 lot" value={money(pipValuePerLot)} />
          <Metric label="Pip value at volume" value={money(pipValue)} tone="brand" />
          <Metric label="P/L for pips" value={money(profitLoss)} tone={profitLoss >= 0 ? 'positive' : 'negative'} />
          <Metric label="Typical spread cost" value={money(spreadCost)} />
        </div>
      </Card>
    </div>
  );
}

function seededRandom(seed: number) {
  let state = seed || 1;
  return () => {
    state = (state * 48271) % 0x7fffffff;
    return (state & 0x7fffffff) / 0x7fffffff;
  };
}

function CompoundCalculator() {
  const [startingBalance, setStartingBalance] = useState(2_000);
  const [returnPercent, setReturnPercent] = useState(3);
  const [periods, setPeriods] = useState(36);
  const [deposit, setDeposit] = useState(0);
  const [volatility, setVolatility] = useState(5);
  const [simulations, setSimulations] = useState(250);

  const deterministic = useMemo(() => {
    const points = [startingBalance];
    let balance = startingBalance;
    for (let i = 1; i <= periods; i += 1) {
      balance = (balance + deposit) * (1 + returnPercent / 100);
      points.push(balance);
    }
    return points;
  }, [deposit, periods, returnPercent, startingBalance]);

  const monteCarlo = useMemo(() => {
    const rand = seededRandom(42);
    const finalBalances: number[] = [];
    const medianPath = Array.from({ length: periods + 1 }, () => 0);
    const runs = clamp(Math.round(simulations), 20, 1_000);
    for (let run = 0; run < runs; run += 1) {
      let balance = startingBalance;
      medianPath[0] = (medianPath[0] ?? 0) + balance;
      for (let i = 1; i <= periods; i += 1) {
        const shock = (rand() + rand() + rand() + rand() - 2) * (volatility / 100);
        balance = Math.max(0, (balance + deposit) * (1 + returnPercent / 100 + shock));
        medianPath[i] = (medianPath[i] ?? 0) + balance;
      }
      finalBalances.push(balance);
    }
    finalBalances.sort((a, b) => a - b);
    return {
      averagePath: medianPath.map((sum) => sum / runs),
      p10: finalBalances[Math.floor(runs * 0.1)] ?? 0,
      p50: finalBalances[Math.floor(runs * 0.5)] ?? 0,
      p90: finalBalances[Math.floor(runs * 0.9)] ?? 0,
    };
  }, [deposit, periods, returnPercent, simulations, startingBalance, volatility]);

  const finalBalance = deterministic.at(-1) ?? startingBalance;
  const gain = finalBalance - startingBalance - deposit * periods;

  return (
    <div className="space-y-5">
      <Card title="Compounding calculator" eyebrow="Growth projection" description="Model fixed periodic returns, recurring deposits and Monte Carlo volatility around the expected return.">
        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          <Input label="Starting balance" type="number" value={startingBalance} onChange={(e) => setStartingBalance(numberValue(e.target.value))} prefix="$" />
          <Input label="Return / period" type="number" value={returnPercent} onChange={(e) => setReturnPercent(numberValue(e.target.value))} suffix="%" />
          <Input label="Periods" type="number" value={periods} onChange={(e) => setPeriods(clamp(numberValue(e.target.value), 1, 360))} />
          <Input label="Deposit / period" type="number" value={deposit} onChange={(e) => setDeposit(numberValue(e.target.value))} prefix="$" />
          <Input label="Monte Carlo volatility" type="number" value={volatility} onChange={(e) => setVolatility(numberValue(e.target.value))} suffix="%" />
          <Input label="Simulations" type="number" value={simulations} onChange={(e) => setSimulations(clamp(numberValue(e.target.value), 20, 1000))} />
        </div>
      </Card>
      <div className="grid gap-5 xl:grid-cols-[1.3fr_0.7fr]">
        <LineGraph points={deterministic} label="Deterministic compounding curve" tone="positive" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <Metric label="Final balance" value={money(finalBalance)} tone="positive" />
          <Metric label="Net compounded gain" value={money(gain)} tone="brand" />
          <Metric label="Monte Carlo P10" value={money(monteCarlo.p10)} />
          <Metric label="Monte Carlo median / P90" value={`${money(monteCarlo.p50)} / ${money(monteCarlo.p90)}`} />
        </div>
      </div>
      <LineGraph points={monteCarlo.averagePath} label="Average Monte Carlo path" tone="brand" />
    </div>
  );
}

function RiskOfRuinCalculator() {
  const [balance, setBalance] = useState(2_000);
  const [riskPercent, setRiskPercent] = useState(1);
  const [winRate, setWinRate] = useState(45);
  const [rewardRisk, setRewardRisk] = useState(2);
  const [trades, setTrades] = useState(200);
  const [ruinDrawdown, setRuinDrawdown] = useState(30);

  const simulation = useMemo(() => {
    const runs = 750;
    const rand = seededRandom(99);
    let ruined = 0;
    let profitable = 0;
    const avgPath = Array.from({ length: trades + 1 }, () => 0);
    for (let run = 0; run < runs; run += 1) {
      let equity = balance;
      let peak = balance;
      let hitRuin = false;
      avgPath[0] = (avgPath[0] ?? 0) + equity;
      for (let i = 1; i <= trades; i += 1) {
        const risk = equity * (riskPercent / 100);
        const won = rand() < winRate / 100;
        equity += won ? risk * rewardRisk : -risk;
        peak = Math.max(peak, equity);
        const drawdown = peak > 0 ? ((peak - equity) / peak) * 100 : 100;
        if (drawdown >= ruinDrawdown) hitRuin = true;
        avgPath[i] = (avgPath[i] ?? 0) + equity;
      }
      if (hitRuin) ruined += 1;
      if (equity > balance) profitable += 1;
    }
    return { ruin: ruined / runs, profitable: profitable / runs, path: avgPath.map((sum) => sum / runs) };
  }, [balance, rewardRisk, riskPercent, ruinDrawdown, trades, winRate]);

  const expectancyR = (winRate / 100) * rewardRisk - (1 - winRate / 100);

  return (
    <div className="space-y-5">
      <Card title="Risk of ruin calculator" eyebrow="Drawdown simulation" description="Simulates fixed-fraction risk. Ruin means the account hits your selected peak-to-trough drawdown before the sample ends.">
        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          <Input label="Starting balance" type="number" value={balance} onChange={(e) => setBalance(numberValue(e.target.value))} prefix="$" />
          <Input label="Risk / trade" type="number" value={riskPercent} onChange={(e) => setRiskPercent(numberValue(e.target.value))} suffix="%" />
          <Input label="Win rate" type="number" value={winRate} onChange={(e) => setWinRate(numberValue(e.target.value))} suffix="%" />
          <Input label="Reward:risk" type="number" value={rewardRisk} onChange={(e) => setRewardRisk(numberValue(e.target.value))} suffix="R" />
          <Input label="Trades" type="number" value={trades} onChange={(e) => setTrades(clamp(numberValue(e.target.value), 10, 1000))} />
          <Input label="Ruin drawdown" type="number" value={ruinDrawdown} onChange={(e) => setRuinDrawdown(clamp(numberValue(e.target.value), 1, 95))} suffix="%" />
        </div>
      </Card>
      <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <LineGraph points={simulation.path} label="Average equity path" tone={simulation.path.at(-1)! >= balance ? 'positive' : 'negative'} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Metric label="Risk of ruin" value={formatPercent(simulation.ruin * 100)} tone={simulation.ruin > 0.25 ? 'negative' : 'positive'} />
          <Metric label="Profitable paths" value={formatPercent(simulation.profitable * 100)} tone="brand" />
          <Metric label="Expectancy" value={`${expectancyR.toFixed(2)}R / trade`} tone={expectancyR >= 0 ? 'positive' : 'negative'} />
          <Metric label="Breakeven win rate" value={formatPercent((1 / (1 + rewardRisk)) * 100)} />
        </div>
      </div>
    </div>
  );
}

function MarginCalculator() {
  const [instrumentSymbol, setInstrumentSymbol] = useState('XAUUSD');
  const instrument = INSTRUMENTS.find((item) => item.symbol === instrumentSymbol) ?? DEFAULT_INSTRUMENT;
  const [lots, setLots] = useState(1);
  const [price, setPrice] = useState(2400);
  const [leverage, setLeverage] = useState(100);
  const [contractSize, setContractSize] = useState(instrument.contractSize);
  const [accountEquity, setAccountEquity] = useState(2_000);

  function applyInstrument(symbol: string) {
    const next = INSTRUMENTS.find((item) => item.symbol === symbol) ?? DEFAULT_INSTRUMENT;
    setInstrumentSymbol(next.symbol);
    setContractSize(next.contractSize);
    if (next.symbol === 'XAUUSD') setPrice(2400);
    else if (next.symbol.includes('JPY')) setPrice(150);
    else if (next.assetClass === 'Forex') setPrice(1);
  }

  const notional = lots * contractSize * price * instrument.quoteToUsd;
  const margin = leverage > 0 ? notional / leverage : 0;
  const marginUsage = accountEquity > 0 ? (margin / accountEquity) * 100 : 0;
  const freeMargin = accountEquity - margin;

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_0.9fr]">
      <Card title="Margin calculator" eyebrow="Leverage control" description="Estimate notional exposure and required margin before opening a position.">
        <div className="grid gap-4 md:grid-cols-2">
          <Select label="Instrument" value={instrumentSymbol} onChange={(e) => applyInstrument(e.target.value)} options={INSTRUMENTS.map((item) => ({ value: item.symbol, label: `${item.label} · ${item.assetClass}` }))} />
          <Input label="Lots" type="number" value={lots} onChange={(e) => setLots(numberValue(e.target.value))} />
          <Input label="Market price" type="number" value={price} onChange={(e) => setPrice(numberValue(e.target.value))} />
          <Input label="Contract size" type="number" value={contractSize} onChange={(e) => setContractSize(numberValue(e.target.value))} />
          <Input label="Leverage" type="number" value={leverage} onChange={(e) => setLeverage(numberValue(e.target.value))} suffix=":1" />
          <Input label="Account equity" type="number" value={accountEquity} onChange={(e) => setAccountEquity(numberValue(e.target.value))} prefix="$" />
        </div>
      </Card>
      <Card title="Result" eyebrow="Exposure">
        <div className="grid gap-3 sm:grid-cols-2">
          <Metric label="Notional exposure" value={money(notional)} tone="brand" />
          <Metric label="Required margin" value={money(margin)} />
          <Metric label="Margin usage" value={formatPercent(marginUsage)} tone={marginUsage > 50 ? 'negative' : 'positive'} />
          <Metric label="Estimated free margin" value={money(freeMargin)} tone={freeMargin >= 0 ? 'positive' : 'negative'} />
        </div>
      </Card>
    </div>
  );
}

export function CalculatorsPage() {
  const [activeTab, setActiveTab] = useState<CalculatorTab>('lot-size');
  const active = TABS.find((tab) => tab.id === activeTab) ?? DEFAULT_TAB;

  return (
    <div className="space-y-6">
      <div className="rounded-card border border-line bg-surface p-5 shadow-card">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-brand text-[11px] font-semibold tracking-widest uppercase">Trading toolbox</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-content-primary">Calculators</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-content-secondary">
              Quick risk, pip, compounding, Monte Carlo and margin calculators for forex, metals, indices, crypto and energy CFDs. Defaults are editable because broker contract specs can differ.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            {[Calculator, Percent, LineChart, ShieldAlert, PiggyBank].map((Icon, index) => (
              <span key={index} className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-subtle text-brand">
                <Icon className="h-4 w-4" />
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <aside className="rounded-card border border-line bg-surface p-3 shadow-card lg:sticky lg:top-24 lg:self-start">
          <div className="mb-3 flex items-center justify-between px-2">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-content-tertiary">Calculator tabs</p>
            <RefreshCw className="h-4 w-4 text-content-tertiary" />
          </div>
          <div className="space-y-2">
            {TABS.map((tab) => (
              <button
                type="button"
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'w-full cursor-pointer rounded-2xl px-4 py-3 text-left transition-colors',
                  activeTab === tab.id ? 'bg-brand text-white shadow-card' : 'bg-surface-muted text-content-secondary hover:text-content-primary',
                )}
              >
                <span className="block text-sm font-semibold">{tab.label}</span>
                <span className={cn('mt-1 block text-xs leading-5', activeTab === tab.id ? 'text-white/75' : 'text-content-tertiary')}>{tab.description}</span>
              </button>
            ))}
          </div>
          <div className="mt-4 rounded-2xl border border-line-subtle bg-surface-muted p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-content-primary">
              <Plus className="h-4 w-4 text-brand" /> Broker notes
            </div>
            <p className="mt-2 text-xs leading-5 text-content-tertiary">
              Always verify contract size, tick value and minimum lot step inside your broker's symbol specification before using a calculated size live.
            </p>
          </div>
        </aside>

        <section className="min-w-0 space-y-5">
          <div className="rounded-card border border-line bg-surface px-5 py-4 shadow-card">
            <p className="text-brand text-[11px] font-semibold tracking-widest uppercase">{active.label}</p>
            <h3 className="mt-1 text-lg font-semibold text-content-primary">{active.description}</h3>
          </div>
          {activeTab === 'lot-size' ? <LotSizeCalculator /> : null}
          {activeTab === 'pip-value' ? <PipValueCalculator /> : null}
          {activeTab === 'compound' ? <CompoundCalculator /> : null}
          {activeTab === 'risk-of-ruin' ? <RiskOfRuinCalculator /> : null}
          {activeTab === 'margin' ? <MarginCalculator /> : null}
        </section>
      </div>
    </div>
  );
}
