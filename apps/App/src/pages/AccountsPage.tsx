import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Building2, Plus, Trash2 } from 'lucide-react';

import { apiClient } from '../lib/api';
import { queryClient } from '../lib/query-client';
import { formatTimestamp } from '../lib/utils';
import { useToastStore } from '../store/toast-store';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Skeleton } from '../components/ui/Skeleton';

function AccountsSkeleton() {
  return (
    <div className="max-w-4xl space-y-5">
      <Card title="Trading Accounts" eyebrow="Portfolio">
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-14 w-full" />
          ))}
        </div>
      </Card>
      <Card title="Add Account" eyebrow="Safe Metadata">
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-28" />
        </div>
      </Card>
    </div>
  );
}

export function AccountsPage() {
  const pushToast = useToastStore((state) => state.push);
  const accountsQuery = useQuery({
    queryKey: ['accounts'],
    queryFn: apiClient.accounts,
  });

  const [name, setName] = useState('');
  const [broker, setBroker] = useState('');

  const createMutation = useMutation({
    mutationFn: apiClient.createAccount,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['accounts'] });
      setName('');
      setBroker('');
      pushToast({
        tone: 'success',
        title: 'Account created',
        description: 'The broker label was added without storing credentials.',
      });
    },
    onError: () => {
      pushToast({
        tone: 'error',
        title: 'Account creation failed',
        description: 'TradePilot could not save the new account label.',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: apiClient.deleteAccount,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['accounts'] });
      pushToast({
        tone: 'success',
        title: 'Account removed',
        description: 'The account label was deleted.',
      });
    },
    onError: () => {
      pushToast({
        tone: 'error',
        title: 'Delete failed',
        description: 'TradePilot could not remove that account entry.',
      });
    },
  });

  if (accountsQuery.isLoading) {
    return <AccountsSkeleton />;
  }

  const accounts = accountsQuery.data ?? [];

  return (
    <div className="max-w-4xl space-y-5">
      <Card
        title="Trading Accounts"
        eyebrow="Portfolio"
        description="Labels only. No broker usernames, passwords, or terminal credentials are stored."
        actions={
          <Badge tone="info">
            {accounts.length} {accounts.length === 1 ? 'account' : 'accounts'}
          </Badge>
        }
      >
        {accounts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-slate-800">
              <Building2 className="h-5 w-5 text-gray-400 dark:text-slate-500" />
            </div>
            <p className="text-sm font-medium text-gray-900 dark:text-slate-100">
              No accounts yet
            </p>
            <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">
              Add a broker label below to keep your account list organized.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-slate-800">
            {accounts.map((account) => (
              <div
                key={account.id}
                className="flex items-center justify-between gap-4 py-3.5 first:pt-0 last:pb-0"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-500/10">
                    <Building2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900 dark:text-slate-100">
                      {account.name}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-slate-500">
                      {account.broker}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
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

      <Card
        title="Add Account"
        eyebrow="Safe Metadata"
        description="Only the display name and broker label are stored."
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();

            if (name.trim() && broker.trim()) {
              createMutation.mutate({
                name: name.trim(),
                broker: broker.trim(),
              });
            }
          }}
          className="space-y-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Account name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Primary Live"
              required
            />
            <Input
              label="Broker"
              value={broker}
              onChange={(event) => setBroker(event.target.value)}
              placeholder="IC Markets"
              required
            />
          </div>

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
