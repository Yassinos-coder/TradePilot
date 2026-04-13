import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Building2, Plus, Trash2, AlertCircle } from 'lucide-react';

import { apiClient } from '../lib/api';
import { queryClient } from '../lib/query-client';
import { formatTimestamp } from '../lib/utils';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';

export function AccountsPage() {
  const accountsQuery = useQuery({
    queryKey: ['accounts'],
    queryFn: apiClient.accounts,
  });

  const [name, setName] = useState('');
  const [broker, setBroker] = useState('');

  const createMutation = useMutation({
    mutationFn: apiClient.createAccount,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      setName('');
      setBroker('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: apiClient.deleteAccount,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['accounts'] }),
  });

  const accounts = accountsQuery.data ?? [];

  return (
    <div className="max-w-4xl space-y-5">
      {/* Account list */}
      <Card
        title="Trading Accounts"
        eyebrow="Portfolio"
        description="Account labels only — no broker credentials are ever stored."
        actions={
          <Badge tone="info">{accounts.length} {accounts.length === 1 ? 'account' : 'accounts'}</Badge>
        }
      >
        {accounts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-slate-800 mb-3">
              <Building2 className="h-5 w-5 text-gray-400 dark:text-slate-500" />
            </div>
            <p className="text-sm font-medium text-gray-900 dark:text-slate-100">No accounts yet</p>
            <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">
              Add an account label below to track your brokers.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-slate-800">
            {accounts.map((account) => (
              <div
                key={account.id}
                className="flex items-center justify-between gap-4 py-3.5 first:pt-0 last:pb-0"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-500/10">
                    <Building2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-slate-100 truncate">
                      {account.name}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-slate-500">{account.broker}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="hidden text-xs text-gray-400 dark:text-slate-500 sm:block">
                    {formatTimestamp(account.createdAt)}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteMutation.mutate(account.id)}
                    isLoading={
                      deleteMutation.isPending && deleteMutation.variables === account.id
                    }
                    className="text-gray-400 hover:text-red-600 dark:text-slate-500 dark:hover:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Add account */}
      <Card
        title="Add Account"
        eyebrow="Safe Metadata"
        description="Only name and broker are stored. No login credentials."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name && broker) createMutation.mutate({ name, broker });
          }}
          className="space-y-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Account name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Primary Live"
              required
            />
            <Input
              label="Broker"
              value={broker}
              onChange={(e) => setBroker(e.target.value)}
              placeholder="IC Markets"
              required
            />
          </div>

          {createMutation.isError && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
              <AlertCircle className="h-4 w-4 shrink-0" />
              Failed to create account. Please try again.
            </div>
          )}

          <Button
            type="submit"
            isLoading={createMutation.isPending}
            disabled={!name.trim() || !broker.trim()}
          >
            <Plus className="h-3.5 w-3.5" />
            Add account
          </Button>
        </form>
      </Card>
    </div>
  );
}
