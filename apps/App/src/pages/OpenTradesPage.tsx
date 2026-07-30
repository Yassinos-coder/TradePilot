import { FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, BadgeDollarSign, CheckCircle2, RefreshCcw, Send, Zap } from 'lucide-react';

import type { TradeApiOpenInput } from '@tradepilot/shared';

import { apiClient } from '@/lib/api';

type OrderSide = TradeApiOpenInput['side'];
type EntryKind = TradeApiOpenInput['entry'];

const SYMBOL_PRESETS = ['XAUUSD', 'NZDUSD', 'EURUSD', 'GBPUSD', 'BTCUSD', 'NAS100'];

const inputClass =
  'w-full rounded-2xl border border-line bg-surface px-4 py-3 text-sm font-medium text-content-primary outline-none transition focus:border-brand focus:ring-4 focus:ring-brand-subtle';
const labelClass = 'text-xs font-semibold uppercase tracking-[0.18em] text-content-tertiary';

function toNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function accountCommandId(account: { id: string; externalAccountId?: string | null }) {
  return account.externalAccountId ?? account.id;
}

export function OpenTradesPage() {
  const queryClient = useQueryClient();
  const accountsQuery = useQuery({ queryKey: ['accounts'], queryFn: apiClient.accounts });
  const liveAccounts = useMemo(
    () => (accountsQuery.data ?? []).filter((account) => !account.hidden && account.source === 'EA'),
    [accountsQuery.data],
  );
  const defaultAccountId = liveAccounts[0] ? accountCommandId(liveAccounts[0]) : '';

  const [accountId, setAccountId] = useState('');
  const selectedAccountId = accountId || defaultAccountId;
  const [symbol, setSymbol] = useState('XAUUSD');
  const [side, setSide] = useState<OrderSide>('BUY');
  const [entry, setEntry] = useState<EntryKind>('MARKET');
  const [volume, setVolume] = useState('0.01');
  const [entryPrice, setEntryPrice] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');

  const positionsQuery = useQuery({
    queryKey: ['manual-positions', selectedAccountId],
    queryFn: () => apiClient.manualPositions(selectedAccountId),
    enabled: Boolean(selectedAccountId),
    refetchInterval: 20_000,
  });
  const logsQuery = useQuery({
    queryKey: ['execution-logs', selectedAccountId],
    queryFn: () => apiClient.executionLogs(selectedAccountId),
    enabled: Boolean(selectedAccountId),
    refetchInterval: 20_000,
  });

  const payload = useMemo<TradeApiOpenInput>(() => ({
    accountId: selectedAccountId,
    symbol: symbol.toUpperCase().trim(),
    side,
    volume: Number(volume),
    entry,
    entryPrice: entry === 'MARKET' ? null : toNumber(entryPrice),
    stopLoss: toNumber(stopLoss),
    takeProfit: toNumber(takeProfit),
  }), [selectedAccountId, symbol, side, volume, entry, entryPrice, stopLoss, takeProfit]);

  const validationError = useMemo(() => {
    if (!selectedAccountId) return 'Connect an EA account first.';
    if (!payload.symbol || payload.symbol.length < 2) return 'Symbol is required.';
    if (!Number.isFinite(payload.volume) || payload.volume <= 0) return 'Volume must be greater than zero.';
    if (entry !== 'MARKET' && !payload.entryPrice) return `${entry} orders need an entry price.`;
    return null;
  }, [entry, payload, selectedAccountId]);

  const openMutation = useMutation({
    mutationFn: apiClient.manualOpen,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['manual-positions', selectedAccountId] }),
        queryClient.invalidateQueries({ queryKey: ['execution-logs', selectedAccountId] }),
      ]);
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (validationError) return;
    openMutation.mutate(payload);
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="overflow-hidden rounded-[32px] border border-line bg-surface shadow-[0_24px_90px_-50px_rgba(15,23,42,0.38)]">
        <div className="grid gap-6 bg-surface-inset p-6 lg:grid-cols-[1.1fr_0.9fr] lg:p-8">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-brand bg-brand-subtle px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-brand">
              <Zap className="h-3.5 w-3.5" /> Manual execution
            </div>
            <div>
              <h2 className="text-3xl font-semibold tracking-tight text-content-primary sm:text-4xl">
                Open trades directly through your connected EA
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-content-secondary">
                Send MARKET, LIMIT, and STOP orders from the dashboard. Commands are delivered to the EA instantly, and the final broker result appears in the execution log.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-3xl border border-line bg-surface/80 p-4">
                <p className="text-xs text-content-tertiary">Connected EAs</p>
                <p className="mt-1 text-2xl font-semibold text-content-primary">{liveAccounts.length}</p>
              </div>
              <div className="rounded-3xl border border-line bg-surface/80 p-4">
                <p className="text-xs text-content-tertiary">Open positions</p>
                <p className="mt-1 text-2xl font-semibold text-content-primary">{positionsQuery.data?.length ?? 0}</p>
              </div>
              <div className="rounded-3xl border border-line bg-surface/80 p-4">
                <p className="text-xs text-content-tertiary">Order types</p>
                <p className="mt-1 text-2xl font-semibold text-content-primary">M / L / S</p>
              </div>
            </div>
          </div>
          <div className="rounded-[28px] border border-warning bg-warning-subtle/90 p-5 text-sm text-warning">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-semibold">Risk guardrail</p>
                <p className="mt-2 leading-6">TradePilot delivers the request; MetaTrader/broker still validates market hours, stop levels, margin, and symbol availability. If the market is closed, the order is rejected and not queued automatically.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1fr_0.85fr]">
        <form onSubmit={submit} className="rounded-[32px] border border-line bg-surface p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <p className={labelClass}>Order ticket</p>
              <h3 className="mt-1 text-xl font-semibold tracking-tight text-content-primary">New trade</h3>
            </div>
            <button type="submit" disabled={Boolean(validationError) || openMutation.isPending} className="inline-flex items-center gap-2 rounded-2xl bg-brand px-4 py-3 text-sm font-semibold text-content-inverse shadow-lg shadow-brand/20 transition hover:bg-brand disabled:cursor-not-allowed disabled:bg-content-tertiary disabled:shadow-none">
              {openMutation.isPending ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send order
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 md:col-span-2">
              <span className={labelClass}>EA account</span>
              <select className={inputClass} value={selectedAccountId} onChange={(event) => setAccountId(event.target.value)}>
                {liveAccounts.length === 0 ? <option value="">No connected EA accounts</option> : null}
                {liveAccounts.map((account) => {
                  const commandId = accountCommandId(account);
                  return <option key={account.id} value={commandId}>{account.name} · {commandId}{account.online ? ' · online' : ''}</option>;
                })}
              </select>
            </label>

            <label className="space-y-2">
              <span className={labelClass}>Symbol</span>
              <input className={inputClass} list="symbol-presets" value={symbol} onChange={(event) => setSymbol(event.target.value.toUpperCase())} placeholder="XAUUSD" />
              <datalist id="symbol-presets">{SYMBOL_PRESETS.map((item) => <option key={item} value={item} />)}</datalist>
            </label>

            <label className="space-y-2">
              <span className={labelClass}>Volume</span>
              <input className={inputClass} inputMode="decimal" value={volume} onChange={(event) => setVolume(event.target.value)} placeholder="0.01" />
            </label>

            <div className="space-y-2">
              <span className={labelClass}>Side</span>
              <div className="grid grid-cols-2 gap-2 rounded-2xl bg-surface-muted p-1">
                {(['BUY', 'SELL'] as OrderSide[]).map((item) => (
                  <button key={item} type="button" onClick={() => setSide(item)} className={["flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition", side === item ? (item === 'BUY' ? 'bg-positive text-content-inverse shadow-lg shadow-positive/20' : 'bg-negative text-content-inverse shadow-lg shadow-negative/20') : 'text-content-tertiary hover:bg-surface'].join(' ')}>
                    {item === 'BUY' ? <ArrowUpCircle className="h-4 w-4" /> : <ArrowDownCircle className="h-4 w-4" />}{item}
                  </button>
                ))}
              </div>
            </div>

            <label className="space-y-2">
              <span className={labelClass}>Order type</span>
              <select className={inputClass} value={entry} onChange={(event) => setEntry(event.target.value as EntryKind)}>
                <option value="MARKET">Market</option>
                <option value="LIMIT">Limit pending</option>
                <option value="STOP">Stop pending</option>
              </select>
            </label>

            {entry !== 'MARKET' ? (
              <label className="space-y-2">
                <span className={labelClass}>Entry price</span>
                <input className={inputClass} inputMode="decimal" value={entryPrice} onChange={(event) => setEntryPrice(event.target.value)} placeholder={symbol.startsWith('XAU') ? '3975.00' : '0.57550'} />
              </label>
            ) : null}

            <label className="space-y-2">
              <span className={labelClass}>Stop loss</span>
              <input className={inputClass} inputMode="decimal" value={stopLoss} onChange={(event) => setStopLoss(event.target.value)} placeholder="Optional" />
            </label>

            <label className="space-y-2">
              <span className={labelClass}>Take profit</span>
              <input className={inputClass} inputMode="decimal" value={takeProfit} onChange={(event) => setTakeProfit(event.target.value)} placeholder="Optional" />
            </label>
          </div>

          <div className="mt-5 rounded-3xl border border-line bg-surface-muted p-4">
            <p className={labelClass}>Preview</p>
            <p className="mt-2 text-sm font-semibold text-content-primary">
              {payload.side} {payload.symbol || '--'} · {payload.entry}{payload.entry !== 'MARKET' ? ` @ ${payload.entryPrice ?? '--'}` : ''} · {payload.volume || '--'} lots
            </p>
            {validationError ? <p className="mt-2 text-sm text-negative">{validationError}</p> : null}
            {openMutation.isSuccess ? (
              <p className="mt-2 flex items-center gap-2 text-sm text-positive"><CheckCircle2 className="h-4 w-4" /> Delivered to EA: {openMutation.data.requestId}</p>
            ) : null}
            {openMutation.isError ? <p className="mt-2 text-sm text-negative">{openMutation.error instanceof Error ? openMutation.error.message : 'Order failed'}</p> : null}
          </div>
        </form>

        <div className="space-y-6">
          <section className="rounded-[32px] border border-line bg-surface p-5 shadow-sm sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className={labelClass}>Broker state</p>
                <h3 className="mt-1 text-xl font-semibold text-content-primary">Open positions</h3>
              </div>
              <BadgeDollarSign className="h-5 w-5 text-brand" />
            </div>
            <div className="space-y-3">
              {(positionsQuery.data ?? []).slice(0, 6).map((trade) => (
                <div key={trade.id} className="rounded-2xl border border-line p-3 text-sm">
                  <div className="flex items-center justify-between gap-3"><span className="font-semibold text-content-primary">{trade.symbol} {trade.type}</span><span className="text-content-tertiary">{trade.volume} lots</span></div>
                  <p className="mt-1 text-xs text-content-tertiary">Entry {trade.entryPrice} · SL {trade.stopLoss ?? '--'} · TP {trade.takeProfit ?? '--'}</p>
                </div>
              ))}
              {!positionsQuery.isLoading && (positionsQuery.data ?? []).length === 0 ? <p className="rounded-2xl border border-dashed border-line p-4 text-sm text-content-tertiary">No open positions reported for this account.</p> : null}
            </div>
          </section>

          <section className="rounded-[32px] border border-line bg-surface p-5 shadow-sm sm:p-6">
            <div className="mb-4">
              <p className={labelClass}>Execution feed</p>
              <h3 className="mt-1 text-xl font-semibold text-content-primary">Latest EA results</h3>
            </div>
            <div className="space-y-3">
              {(logsQuery.data ?? []).slice(0, 6).map((log) => (
                <div key={log.id} className="rounded-2xl border border-line p-3 text-sm">
                  <div className="flex items-center justify-between gap-3"><span className={log.status.includes('FAILED') ? 'font-semibold text-negative' : 'font-semibold text-content-primary'}>{log.status}</span><span className="text-xs text-content-tertiary">{new Date(log.createdAt).toLocaleTimeString()}</span></div>
                  <p className="mt-1 text-xs leading-5 text-content-tertiary">{log.message}</p>
                </div>
              ))}
              {!logsQuery.isLoading && (logsQuery.data ?? []).length === 0 ? <p className="rounded-2xl border border-dashed border-line p-4 text-sm text-content-tertiary">No logs yet for this account.</p> : null}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
