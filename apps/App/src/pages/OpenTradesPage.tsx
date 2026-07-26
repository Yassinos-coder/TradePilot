import { FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, BadgeDollarSign, CheckCircle2, RefreshCcw, Send, Zap } from 'lucide-react';

import { PositionProxyOpenInput } from '@tradepilot/shared';

import { apiClient } from '../lib/api';

type OrderSide = PositionProxyOpenInput['side'];
type EntryKind = PositionProxyOpenInput['entry'];

const SYMBOL_PRESETS = ['XAUUSD', 'NZDUSD', 'EURUSD', 'GBPUSD', 'BTCUSD', 'NAS100'];

const inputClass =
  'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-sky-500 dark:focus:ring-sky-500/10';
const labelClass = 'text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400';

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
    queryKey: ['position-proxy-positions', selectedAccountId],
    queryFn: () => apiClient.positionProxyPositions(selectedAccountId),
    enabled: Boolean(selectedAccountId),
    refetchInterval: 10_000,
  });
  const logsQuery = useQuery({
    queryKey: ['execution-logs', selectedAccountId],
    queryFn: () => apiClient.executionLogs(selectedAccountId),
    enabled: Boolean(selectedAccountId),
    refetchInterval: 8_000,
  });

  const payload = useMemo<PositionProxyOpenInput>(() => ({
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
    mutationFn: apiClient.positionProxyOpen,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['position-proxy-positions', selectedAccountId] }),
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
      <section className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_24px_90px_-50px_rgba(15,23,42,0.38)] dark:border-slate-800 dark:bg-slate-950">
        <div className="grid gap-6 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.20),transparent_34%),linear-gradient(135deg,#f8fafc,#ffffff)] p-6 dark:bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.22),transparent_32%),linear-gradient(135deg,#020617,#0f172a)] lg:grid-cols-[1.1fr_0.9fr] lg:p-8">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300">
              <Zap className="h-3.5 w-3.5" /> Manual execution
            </div>
            <div>
              <h2 className="text-3xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-4xl">
                Open trades directly through your connected EA
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-400">
                Send MARKET, LIMIT, and STOP orders from the dashboard. Commands are delivered to the EA instantly, and the final broker result appears in the execution log.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-3xl border border-slate-200 bg-white/80 p-4 dark:border-slate-800 dark:bg-slate-900/70">
                <p className="text-xs text-slate-500">Connected EAs</p>
                <p className="mt-1 text-2xl font-semibold text-slate-950 dark:text-white">{liveAccounts.length}</p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-white/80 p-4 dark:border-slate-800 dark:bg-slate-900/70">
                <p className="text-xs text-slate-500">Open positions</p>
                <p className="mt-1 text-2xl font-semibold text-slate-950 dark:text-white">{positionsQuery.data?.length ?? 0}</p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-white/80 p-4 dark:border-slate-800 dark:bg-slate-900/70">
                <p className="text-xs text-slate-500">Order types</p>
                <p className="mt-1 text-2xl font-semibold text-slate-950 dark:text-white">M / L / S</p>
              </div>
            </div>
          </div>
          <div className="rounded-[28px] border border-amber-200 bg-amber-50/90 p-5 text-sm text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
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
        <form onSubmit={submit} className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950 sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <p className={labelClass}>Order ticket</p>
              <h3 className="mt-1 text-xl font-semibold tracking-tight text-slate-950 dark:text-white">New trade</h3>
            </div>
            <button type="submit" disabled={Boolean(validationError) || openMutation.isPending} className="inline-flex items-center gap-2 rounded-2xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-600/20 transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none dark:disabled:bg-slate-800">
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
              <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1 dark:bg-slate-900">
                {(['BUY', 'SELL'] as OrderSide[]).map((item) => (
                  <button key={item} type="button" onClick={() => setSide(item)} className={["flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition", side === item ? (item === 'BUY' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'bg-red-500 text-white shadow-lg shadow-red-500/20') : 'text-slate-500 hover:bg-white dark:hover:bg-slate-800'].join(' ')}>
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

          <div className="mt-5 rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/70">
            <p className={labelClass}>Preview</p>
            <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              {payload.side} {payload.symbol || '--'} · {payload.entry}{payload.entry !== 'MARKET' ? ` @ ${payload.entryPrice ?? '--'}` : ''} · {payload.volume || '--'} lots
            </p>
            {validationError ? <p className="mt-2 text-sm text-red-500">{validationError}</p> : null}
            {openMutation.isSuccess ? (
              <p className="mt-2 flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4" /> Delivered to EA: {openMutation.data.requestId}</p>
            ) : null}
            {openMutation.isError ? <p className="mt-2 text-sm text-red-500">{openMutation.error instanceof Error ? openMutation.error.message : 'Order failed'}</p> : null}
          </div>
        </form>

        <div className="space-y-6">
          <section className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950 sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className={labelClass}>Broker state</p>
                <h3 className="mt-1 text-xl font-semibold text-slate-950 dark:text-white">Open positions</h3>
              </div>
              <BadgeDollarSign className="h-5 w-5 text-sky-500" />
            </div>
            <div className="space-y-3">
              {(positionsQuery.data ?? []).slice(0, 6).map((trade) => (
                <div key={trade.id} className="rounded-2xl border border-slate-200 p-3 text-sm dark:border-slate-800">
                  <div className="flex items-center justify-between gap-3"><span className="font-semibold text-slate-900 dark:text-white">{trade.symbol} {trade.type}</span><span className="text-slate-500">{trade.volume} lots</span></div>
                  <p className="mt-1 text-xs text-slate-500">Entry {trade.entryPrice} · SL {trade.stopLoss ?? '--'} · TP {trade.takeProfit ?? '--'}</p>
                </div>
              ))}
              {!positionsQuery.isLoading && (positionsQuery.data ?? []).length === 0 ? <p className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500 dark:border-slate-800">No open positions reported for this account.</p> : null}
            </div>
          </section>

          <section className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950 sm:p-6">
            <div className="mb-4">
              <p className={labelClass}>Execution feed</p>
              <h3 className="mt-1 text-xl font-semibold text-slate-950 dark:text-white">Latest EA results</h3>
            </div>
            <div className="space-y-3">
              {(logsQuery.data ?? []).slice(0, 6).map((log) => (
                <div key={log.id} className="rounded-2xl border border-slate-200 p-3 text-sm dark:border-slate-800">
                  <div className="flex items-center justify-between gap-3"><span className={log.status.includes('FAILED') ? 'font-semibold text-red-500' : 'font-semibold text-slate-900 dark:text-white'}>{log.status}</span><span className="text-xs text-slate-500">{new Date(log.createdAt).toLocaleTimeString()}</span></div>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{log.message}</p>
                </div>
              ))}
              {!logsQuery.isLoading && (logsQuery.data ?? []).length === 0 ? <p className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500 dark:border-slate-800">No logs yet for this account.</p> : null}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
