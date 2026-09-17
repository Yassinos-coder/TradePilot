import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Activity, CheckCircle2, Copy, Crown, Plus, Users } from 'lucide-react';

import type {
  AccountDTO,
  CopierLinkDTO,
  CopierRiskParams,
  CreateCopierLinkInput,
} from '@tradepilot/shared';

import { CopierLinkCard } from '@/components/copier/CopierLinkCard';
import { CopyFeed } from '@/components/copier/CopyFeed';
import { RiskParamsForm } from '@/components/copier/RiskParamsForm';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Drawer } from '@/components/ui/Drawer';
import { ConfirmDialog } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatTile } from '@/components/ui/StatTile';
import { Switch } from '@/components/ui/Toggle';
import { accountLabel } from '@/lib/account-label';
import { apiClient } from '@/lib/api';
import { queryClient } from '@/lib/query-client';
import { formatPercent } from '@/lib/utils';
import { useToastStore } from '@/store/toast-store';

type DrawerState =
  | { mode: 'closed' }
  | { mode: 'create'; slaveAccountId: string; params: CopierRiskParams }
  | { mode: 'edit'; link: CopierLinkDTO; params: CopierRiskParams };

function toRiskParams(link: CopierLinkDTO): CopierRiskParams {
  const {
    id: _id,
    masterAccountId: _masterAccountId,
    slaveAccountId: _slaveAccountId,
    slaveAccountName: _slaveAccountName,
    slaveAccountOnline: _slaveAccountOnline,
    enabled: _enabled,
    copiesToday: _copiesToday,
    lastCopyAt: _lastCopyAt,
    symbolMatchStatus: _symbolMatchStatus,
    symbolMatchReport: _symbolMatchReport,
    symbolMatchCheckedAt: _symbolMatchCheckedAt,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    ...params
  } = link;

  return params;
}

export function CopierPage() {
  const pushToast = useToastStore((state) => state.push);
  const [drawer, setDrawer] = useState<DrawerState>({ mode: 'closed' });
  const [pendingDelete, setPendingDelete] = useState<CopierLinkDTO | null>(null);
  const [masterDraft, setMasterDraft] = useState<string>('');

  const accountsQuery = useQuery({
    queryKey: ['accounts'],
    queryFn: () => apiClient.accounts(),
    refetchInterval: 30_000,
  });
  const linksQuery = useQuery({ queryKey: ['copier', 'links'], queryFn: apiClient.copierLinks });
  const overviewQuery = useQuery({
    queryKey: ['copier', 'overview'],
    queryFn: apiClient.copierOverview,
    refetchInterval: 30_000,
  });
  const eventsQuery = useQuery({
    queryKey: ['copier', 'events'],
    queryFn: () => apiClient.copyEvents(25),
    refetchInterval: 20_000,
  });
  const settingsQuery = useQuery({ queryKey: ['settings'], queryFn: apiClient.settings });

  const accounts = accountsQuery.data ?? [];
  const links = linksQuery.data ?? [];
  const overview = overviewQuery.data;
  const master = accounts.find((account) => account.role === 'MASTER') ?? null;

  useEffect(() => {
    setMasterDraft(master?.id ?? '');
  }, [master?.id]);

  const linkedSlaveIds = useMemo(() => new Set(links.map((link) => link.slaveAccountId)), [links]);
  const availableSlaves = accounts.filter(
    (account) => account.id !== master?.id && !linkedSlaveIds.has(account.id),
  );

  const invalidateCopier = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['copier'] }),
      queryClient.invalidateQueries({ queryKey: ['accounts'] }),
    ]);
  };

  const setMasterMutation = useMutation({
    mutationFn: (accountId: string | null) => apiClient.setMasterAccount(accountId),
    onSuccess: async () => {
      await invalidateCopier();
      pushToast({ tone: 'success', title: 'Master account updated' });
    },
    onError: () => pushToast({ tone: 'error', title: 'Could not set the master account' }),
  });

  const createLinkMutation = useMutation({
    mutationFn: (payload: CreateCopierLinkInput) => apiClient.createCopierLink(payload),
    onSuccess: async (link) => {
      await invalidateCopier();
      setDrawer({ mode: 'closed' });

      if (link.symbolMatchStatus === 'PARTIAL' || link.symbolMatchStatus === 'UNMATCHED') {
        const unmatched = link.symbolMatchReport.filter((entry) => !entry.slaveSymbol);
        pushToast({
          tone: 'info',
          title: 'Slave account linked with symbol mismatches',
          description: `${unmatched.length} symbol${unmatched.length === 1 ? '' : 's'} (${unmatched
            .map((entry) => entry.masterSymbol)
            .join(', ')}) could not be matched on this broker. Set a symbol prefix/suffix to fix it.`,
        });
        return;
      }

      pushToast({ tone: 'success', title: 'Slave account linked' });
    },
    onError: () =>
      pushToast({
        tone: 'error',
        title: 'Could not link that account',
        description: 'Check that a master is set and the account is not already linked.',
      }),
  });

  const updateLinkMutation = useMutation({
    mutationFn: ({ linkId, params }: { linkId: string; params: Partial<CopierRiskParams> & { enabled?: boolean } }) =>
      apiClient.updateCopierLink(linkId, params),
    onSuccess: async () => {
      await invalidateCopier();
      setDrawer({ mode: 'closed' });
      pushToast({ tone: 'success', title: 'Risk parameters saved' });
    },
    onError: () => pushToast({ tone: 'error', title: 'Could not save risk parameters' }),
  });

  const deleteLinkMutation = useMutation({
    mutationFn: (linkId: string) => apiClient.deleteCopierLink(linkId),
    onSuccess: async () => {
      await invalidateCopier();
      setPendingDelete(null);
      pushToast({ tone: 'success', title: 'Link removed' });
    },
    onError: () => pushToast({ tone: 'error', title: 'Could not remove the link' }),
  });

  const autoCopyMutation = useMutation({
    mutationFn: (enabled: boolean) => apiClient.updateAutoCopy(enabled),
    onSuccess: async (data) => {
      queryClient.setQueryData(['settings'], data);
      await queryClient.invalidateQueries({ queryKey: ['copier'] });
    },
    onError: () => pushToast({ tone: 'error', title: 'Could not change the copier state' }),
  });

  if (accountsQuery.isLoading || linksQuery.isLoading || settingsQuery.isLoading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (accountsQuery.isError || linksQuery.isError || settingsQuery.isError) {
    return (
      <Alert tone="warning" title="Could not load copier configuration">
        Your accounts may still be connected. Retry to load the account list and copier settings.
        <Button
          variant="outline"
          className="mt-3"
          onClick={() => {
            void accountsQuery.refetch();
            void linksQuery.refetch();
            void settingsQuery.refetch();
          }}
        >
          Retry
        </Button>
      </Alert>
    );
  }

  const settings = settingsQuery.data;
  const copierLive = Boolean(settings?.autoCopyEnabled && !settings.executionPaused);

  const openCreateDrawer = (slaveAccountId: string) => {
    setDrawer({
      mode: 'create',
      slaveAccountId,
      params: settings?.copierDefaults as CopierRiskParams,
    });
  };

  return (
    <div className="space-y-6">
      {/* Master kill switch */}
      <div className="border-line bg-surface rounded-card flex flex-wrap items-center justify-between gap-4 border p-5 shadow-card">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-content-primary text-sm font-semibold">Copier engine</h2>
            <Badge tone={copierLive ? 'positive' : 'warning'} dot pulse={copierLive}>
              {copierLive ? 'Live' : 'Paused'}
            </Badge>
          </div>
          <p className="text-content-tertiary mt-1 text-xs leading-5">
            {copierLive
              ? 'Trades on the master are mirrored to every enabled slave link.'
              : settings?.executionPauseReason
                ? `Paused: ${settings.executionPauseReason.replace(/_/g, ' ').toLowerCase()}`
                : 'Copying is switched off. Nothing will be mirrored.'}
          </p>
        </div>
        <Switch
          checked={copierLive}
          disabled={autoCopyMutation.isPending}
          onCheckedChange={(next) => autoCopyMutation.mutate(next)}
          label="Toggle the copier engine"
        />
      </div>

      {/* Overview tiles */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Master account"
          value={overview?.masterAccountName ?? 'Not set'}
          icon={Crown}
          hint={overview?.masterOnline ? 'EA online' : 'EA offline'}
        />
        <StatTile
          label="Active links"
          value={`${overview?.activeLinks ?? 0} / ${overview?.totalLinks ?? 0}`}
          icon={Users}
          hint={`${overview?.slavesOnline ?? 0} online`}
        />
        <StatTile
          label="Copies today"
          value={overview?.copiesFilledToday ?? 0}
          icon={Copy}
          hint={`${overview?.copiesSkippedToday ?? 0} skipped`}
        />
        <StatTile
          label="Success rate"
          value={
            overview?.copySuccessRate === null || overview?.copySuccessRate === undefined
              ? '--'
              : formatPercent(overview.copySuccessRate)
          }
          icon={CheckCircle2}
          hint={`${overview?.copiesFailedToday ?? 0} failed today`}
        />
      </div>

      {/* Master selection */}
      <Card
        title="Master account"
        eyebrow="Source of truth"
        description="Every trade taken on this account is mirrored to the slave accounts below."
      >
        {accounts.length === 0 ? (
          <Alert tone="warning" title="No accounts connected">
            Attach the TradePilot EA to a MetaTrader terminal with an EA key from Settings → API &
            Keys. The account appears here once it authenticates.
          </Alert>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[240px] flex-1">
              <Select
                label="Master"
                value={masterDraft}
                options={[
                  { value: '', label: 'No master selected' },
                  ...accounts.map((account: AccountDTO) => ({
                    value: account.id,
                    label: `${accountLabel(account)}${account.online ? ' — online' : ''}`,
                  })),
                ]}
                onChange={(event) => setMasterDraft(event.target.value)}
              />
            </div>
            <Button
              onClick={() => setMasterMutation.mutate(masterDraft || null)}
              isLoading={setMasterMutation.isPending}
              disabled={masterDraft === (master?.id ?? '')}
            >
              Save master
            </Button>
          </div>
        )}
        {master && !master.online ? (
          <Alert tone="warning" className="mt-4">
            The master EA is offline, so nothing can be copied right now.
          </Alert>
        ) : null}
      </Card>

      {/* Slave links */}
      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-content-primary text-base font-semibold tracking-tight">
              Slave accounts
            </h2>
            <p className="text-content-tertiary mt-0.5 text-xs leading-5">
              Each link carries its own sizing and risk limits.
            </p>
          </div>
          {master && availableSlaves.length > 0 ? (
            <Select
              aria-label="Add a slave account"
              value=""
              options={[
                { value: '', label: 'Link an account…' },
                ...availableSlaves.map((account) => ({
                  value: account.id,
                  label: accountLabel(account),
                })),
              ]}
              onChange={(event) => {
                if (event.target.value) {
                  openCreateDrawer(event.target.value);
                }
              }}
              className="w-56"
            />
          ) : null}
        </div>

        {!master ? (
          <Alert tone="info">Select a master account first — links hang off the master.</Alert>
        ) : links.length === 0 ? (
          <div className="border-line bg-surface rounded-card border border-dashed p-8 text-center">
            <p className="text-content-secondary text-sm">No slave accounts linked yet.</p>
            {availableSlaves.length > 0 ? (
              <Button
                variant="outline"
                className="mt-3"
                onClick={() => openCreateDrawer(availableSlaves[0]!.id)}
              >
                <Plus className="h-3.5 w-3.5" />
                Link {accountLabel(availableSlaves[0]!)}
              </Button>
            ) : (
              <p className="text-content-tertiary mt-2 text-xs">
                Connect a second MetaTrader terminal to use as a slave.
              </p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {links.map((link) => (
              <CopierLinkCard
                key={link.id}
                link={link}
                isBusy={updateLinkMutation.isPending}
                onEdit={(target) =>
                  setDrawer({ mode: 'edit', link: target, params: toRiskParams(target) })
                }
                onToggle={(target, enabled) =>
                  updateLinkMutation.mutate({ linkId: target.id, params: { enabled } })
                }
                onDelete={(target) => setPendingDelete(target)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Live feed */}
      <Card
        title="Copy activity"
        eyebrow="Live feed"
        description="Every master action and how each slave link handled it."
        actions={<Activity className="text-brand h-4 w-4" />}
      >
        <CopyFeed events={eventsQuery.data ?? []} />
      </Card>

      {/* Risk drawer */}
      <Drawer
        open={drawer.mode !== 'closed'}
        onClose={() => setDrawer({ mode: 'closed' })}
        title={drawer.mode === 'edit' ? 'Edit risk parameters' : 'Link a slave account'}
        description={
          drawer.mode === 'edit'
            ? (drawer.link.slaveAccountName ?? undefined)
            : 'These values apply to this account only.'
        }
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setDrawer({ mode: 'closed' })}>
              Cancel
            </Button>
            <Button
              isLoading={createLinkMutation.isPending || updateLinkMutation.isPending}
              onClick={() => {
                if (drawer.mode === 'create') {
                  createLinkMutation.mutate({
                    ...drawer.params,
                    slaveAccountId: drawer.slaveAccountId,
                    enabled: true,
                  });
                  return;
                }

                if (drawer.mode === 'edit') {
                  updateLinkMutation.mutate({ linkId: drawer.link.id, params: drawer.params });
                }
              }}
            >
              {drawer.mode === 'edit' ? 'Save changes' : 'Create link'}
            </Button>
          </div>
        }
      >
        {drawer.mode !== 'closed' ? (
          <RiskParamsForm
            value={drawer.params}
            onChange={(next) => setDrawer({ ...drawer, params: next })}
          />
        ) : null}
      </Drawer>

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && deleteLinkMutation.mutate(pendingDelete.id)}
        title="Remove this link?"
        description={`Trades on the master will stop being copied to ${pendingDelete?.slaveAccountName ?? 'this account'}. Positions already open on that account are left untouched.`}
        confirmLabel="Remove link"
        destructive
        isLoading={deleteLinkMutation.isPending}
      />
    </div>
  );
}
