import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { X, Zap } from 'lucide-react';
import type { AxiosError } from 'axios';

import type { AccountDTO, SignalRecordDTO } from '@tradepilot/shared';

import { apiClient } from '../../lib/api';
import { queryClient } from '../../lib/query-client';
import { Button } from '../../components/ui/Button';

interface ManualDispatchModalProps {
  signal: SignalRecordDTO;
  onlineAccounts: AccountDTO[];
  onClose: () => void;
}

export function ManualDispatchModal({ signal, onlineAccounts, onClose }: ManualDispatchModalProps) {
  const [selectedAccountId, setSelectedAccountId] = useState(onlineAccounts[0]?.id ?? '');
  const [apiError, setApiError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => apiClient.dispatchManual(signal.id, selectedAccountId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['overview'] });
      onClose();
    },
    onError: (error: AxiosError<{ message?: string }>) => {
      setApiError(
        error.response?.data?.message ?? 'Dispatch failed. Check EA connection and try again.',
      );
    },
  });

  const parsed = signal.parsedData;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
              Manual Dispatch
            </p>
            <h2 className="mt-1 text-lg font-semibold text-slate-950 dark:text-white">
              Execute Signal
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close"
            title="Close"
            onClick={onClose}
            className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-5 space-y-2 rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/60">
          {parsed ? (
            <>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-950 dark:text-white">
                  {parsed.symbol}
                </span>
                {parsed.type ? (
                  <span
                    className={`text-xs font-semibold ${parsed.type === 'BUY' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}
                  >
                    {parsed.type}
                  </span>
                ) : null}
                <span className="text-xs text-slate-500">{parsed.action}</span>
              </div>
              <div className="flex flex-wrap gap-3 text-xs text-slate-500 dark:text-slate-400">
                {parsed.entryPrice ? <span>Entry {parsed.entryPrice}</span> : null}
                {parsed.stopLoss ? <span>SL {parsed.stopLoss}</span> : null}
                {parsed.takeProfits.length > 0 ? (
                  <span>TP {parsed.takeProfits.join(' / ')}</span>
                ) : null}
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-500">{signal.rawMessage}</p>
          )}
        </div>

        <div className="mb-5">
          <label
            htmlFor="account-select"
            className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400"
          >
            Target Account
          </label>
          {onlineAccounts.length === 0 ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
              No EA accounts are currently online.
            </p>
          ) : (
            <select
              id="account-select"
              value={selectedAccountId}
              onChange={(e) => {
                setSelectedAccountId(e.target.value);
                setApiError(null);
              }}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-950 transition-colors focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            >
              {onlineAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                  {account.externalAccountId ? ` (${account.externalAccountId})` : ''}
                </option>
              ))}
            </select>
          )}
        </div>

        {apiError ? (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
            {apiError}
          </div>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => mutation.mutate()}
            isLoading={mutation.isPending}
            disabled={!selectedAccountId || onlineAccounts.length === 0}
          >
            <Zap className="h-3.5 w-3.5" />
            Execute
          </Button>
        </div>
      </div>
    </div>
  );
}
