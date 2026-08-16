import { FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownCircle, ArrowUpCircle, CheckCircle2, Send } from 'lucide-react';

import type { TradeApiOpenInput } from '@tradepilot/shared';

import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { accountLabel } from '@/lib/account-label';
import { apiClient } from '@/lib/api';
import { cn } from '@/lib/utils';

type OrderSide = TradeApiOpenInput['side'];
type EntryKind = TradeApiOpenInput['entry'];

const SYMBOL_PRESETS = ['XAUUSD', 'NZDUSD', 'EURUSD', 'GBPUSD', 'BTCUSD', 'NAS100'];

const ENTRY_OPTIONS = [
  { value: 'MARKET', label: 'Market' },
  { value: 'LIMIT', label: 'Limit pending' },
  { value: 'STOP', label: 'Stop pending' },
];

function toNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function accountCommandId(account: { id: string; externalAccountId?: string | null }) {
  return account.externalAccountId ?? account.id;
}

function EmptyRow({ children }: { children: string }) {
  return (
    <p className="border-line text-content-tertiary rounded-lg border border-dashed p-4 text-sm">
      {children}
    </p>
  );
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

  const payload = useMemo<TradeApiOpenInput>(
    () => ({
      accountId: selectedAccountId,
      symbol: symbol.toUpperCase().trim(),
      side,
      volume: Number(volume),
      entry,
      entryPrice: entry === 'MARKET' ? null : toNumber(entryPrice),
      stopLoss: toNumber(stopLoss),
      takeProfit: toNumber(takeProfit),
    }),
    [selectedAccountId, symbol, side, volume, entry, entryPrice, stopLoss, takeProfit],
  );

  const validationError = useMemo(() => {
    if (!selectedAccountId) return 'Connect an EA account first.';
    if (!payload.symbol || payload.symbol.length < 2) return 'Symbol is required.';
    if (!Number.isFinite(payload.volume) || payload.volume <= 0)
      return 'Volume must be greater than zero.';
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

  const accountOptions = liveAccounts.length
    ? liveAccounts.map((account) => {
        const commandId = accountCommandId(account);
        return {
          value: commandId,
          label: `${accountLabel(account)} · ${commandId}${account.online ? ' · online' : ''}`,
        };
      })
    : [{ value: '', label: 'No connected EA accounts' }];

  function submit(event: FormEvent) {
    event.preventDefault();
    if (validationError) return;
    openMutation.mutate(payload);
  }

  return (
    <div className="space-y-6">
      <Alert tone="warning">
        TradePilot delivers the request; MetaTrader and your broker still validate market hours,
        stop levels, margin and symbol availability. Rejected orders are not queued for retry.
      </Alert>

      <div className="grid gap-6 xl:grid-cols-[1fr_0.85fr]">
        <Card
          eyebrow="Order ticket"
          title="New trade"
          actions={
            <Badge tone={liveAccounts.length ? 'positive' : 'neutral'} dot>
              {liveAccounts.length} EA connected
            </Badge>
          }
        >
          <form onSubmit={submit} className="space-y-4">
            <Select
              label="EA account"
              value={selectedAccountId}
              onChange={(event) => setAccountId(event.target.value)}
              options={accountOptions}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid content-start gap-1.5">
                <label htmlFor="symbol" className="text-content-secondary pl-0.5 text-xs font-medium">
                  Symbol
                </label>
                <input
                  id="symbol"
                  list="symbol-presets"
                  value={symbol}
                  onChange={(event) => setSymbol(event.target.value.toUpperCase())}
                  placeholder="XAUUSD"
                  className="bg-surface text-content-primary placeholder:text-content-tertiary border-line-strong focus:ring-brand/25 focus:border-brand h-10 w-full rounded-lg border px-3 text-sm transition-colors focus:ring-2 focus:outline-none"
                />
                <datalist id="symbol-presets">
                  {SYMBOL_PRESETS.map((item) => (
                    <option key={item} value={item} />
                  ))}
                </datalist>
              </div>

              <Input
                label="Volume"
                inputMode="decimal"
                value={volume}
                onChange={(event) => setVolume(event.target.value)}
                placeholder="0.01"
              />

              <div className="grid content-start gap-1.5">
                <span className="text-content-secondary pl-0.5 text-xs font-medium">Side</span>
                <div className="bg-surface-muted grid grid-cols-2 gap-1 rounded-lg p-1">
                  {(['BUY', 'SELL'] as OrderSide[]).map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setSide(item)}
                      className={cn(
                        'flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-md text-sm font-semibold transition-colors',
                        side !== item && 'text-content-tertiary hover:bg-surface',
                        side === item && item === 'BUY' && 'bg-positive text-white',
                        side === item && item === 'SELL' && 'bg-negative text-white',
                      )}
                    >
                      {item === 'BUY' ? (
                        <ArrowUpCircle className="h-3.5 w-3.5" />
                      ) : (
                        <ArrowDownCircle className="h-3.5 w-3.5" />
                      )}
                      {item}
                    </button>
                  ))}
                </div>
              </div>

              <Select
                label="Order type"
                value={entry}
                onChange={(event) => setEntry(event.target.value as EntryKind)}
                options={ENTRY_OPTIONS}
              />

              {entry !== 'MARKET' ? (
                <Input
                  label="Entry price"
                  inputMode="decimal"
                  value={entryPrice}
                  onChange={(event) => setEntryPrice(event.target.value)}
                  placeholder={symbol.startsWith('XAU') ? '3975.00' : '0.57550'}
                />
              ) : null}

              <Input
                label="Stop loss"
                inputMode="decimal"
                value={stopLoss}
                onChange={(event) => setStopLoss(event.target.value)}
                placeholder="Optional"
              />

              <Input
                label="Take profit"
                inputMode="decimal"
                value={takeProfit}
                onChange={(event) => setTakeProfit(event.target.value)}
                placeholder="Optional"
              />
            </div>

            <div className="border-line bg-surface-muted rounded-lg border p-4">
              <p className="text-content-tertiary text-[11px] font-semibold tracking-widest uppercase">
                Preview
              </p>
              <p className="text-content-primary mt-1.5 text-sm font-semibold">
                {payload.side} {payload.symbol || '--'} · {payload.entry}
                {payload.entry !== 'MARKET' ? ` @ ${payload.entryPrice ?? '--'}` : ''} ·{' '}
                {payload.volume || '--'} lots
              </p>
              {validationError ? (
                <p className="text-negative mt-2 text-sm">{validationError}</p>
              ) : null}
              {openMutation.isSuccess ? (
                <p className="text-positive mt-2 flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4" />
                  Delivered to EA: {openMutation.data.requestId}
                </p>
              ) : null}
              {openMutation.isError ? (
                <p className="text-negative mt-2 text-sm">
                  {openMutation.error instanceof Error
                    ? openMutation.error.message
                    : 'Order failed'}
                </p>
              ) : null}
            </div>

            <Button
              type="submit"
              size="lg"
              fullWidth
              disabled={Boolean(validationError)}
              isLoading={openMutation.isPending}
            >
              <Send className="h-4 w-4" />
              Send order
            </Button>
          </form>
        </Card>

        <div className="space-y-6">
          <Card eyebrow="Broker state" title="Open positions">
            <div className="space-y-2.5">
              {(positionsQuery.data ?? []).slice(0, 6).map((trade) => (
                <div key={trade.id} className="border-line rounded-lg border p-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-content-primary font-semibold">
                      {trade.symbol} {trade.type}
                    </span>
                    <span className="text-content-tertiary tabular">{trade.volume} lots</span>
                  </div>
                  <p className="text-content-tertiary mt-1 text-xs">
                    Entry {trade.entryPrice} · SL {trade.stopLoss ?? '--'} · TP{' '}
                    {trade.takeProfit ?? '--'}
                  </p>
                </div>
              ))}
              {!positionsQuery.isLoading && (positionsQuery.data ?? []).length === 0 ? (
                <EmptyRow>No open positions reported for this account.</EmptyRow>
              ) : null}
            </div>
          </Card>

          <Card eyebrow="Execution feed" title="Latest EA results">
            <div className="space-y-2.5">
              {(logsQuery.data ?? []).slice(0, 6).map((log) => (
                <div key={log.id} className="border-line rounded-lg border p-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span
                      className={cn(
                        'font-semibold',
                        log.status.includes('FAILED') ? 'text-negative' : 'text-content-primary',
                      )}
                    >
                      {log.status}
                    </span>
                    <span className="text-content-tertiary text-xs">
                      {new Date(log.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-content-tertiary mt-1 text-xs leading-5">{log.message}</p>
                </div>
              ))}
              {!logsQuery.isLoading && (logsQuery.data ?? []).length === 0 ? (
                <EmptyRow>No logs yet for this account.</EmptyRow>
              ) : null}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
