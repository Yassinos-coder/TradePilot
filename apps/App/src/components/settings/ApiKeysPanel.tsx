import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Ban, KeyRound, Plus, RefreshCw, Trash2 } from 'lucide-react';

import type { ApiKeyDTO, ApiKeyKind, ApiKeySecretResult } from '@tradepilot/shared';

import { Alert } from '@/components/ui/Alert';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { SecretField } from '@/components/ui/SecretField';
import { Section } from '@/components/ui/Section';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { Toggle } from '@/components/ui/Toggle';
import { apiClient } from '@/lib/api';
import { queryClient } from '@/lib/query-client';
import { formatTimestamp } from '@/lib/utils';
import { useToastStore } from '@/store/toast-store';

const KIND_LABELS: Record<ApiKeyKind, string> = {
  EA: 'Expert Advisor',
  REST: 'REST API',
};

function keyStatus(key: ApiKeyDTO): { label: string; tone: BadgeTone } {
  if (key.revokedAt) {
    return { label: 'Revoked', tone: 'danger' };
  }

  if (key.expiresAt) {
    const expiresAt = new Date(key.expiresAt).getTime();
    if (expiresAt <= Date.now()) {
      return { label: 'Expired', tone: 'neutral' };
    }
    return { label: 'Superseded', tone: 'warning' };
  }

  return { label: 'Active', tone: 'positive' };
}

interface ApiKeysPanelProps {
  allowApiTradeOpening: boolean;
}

export function ApiKeysPanel({ allowApiTradeOpening }: ApiKeysPanelProps) {
  const pushToast = useToastStore((state) => state.push);
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState<{ kind: ApiKeyKind; name: string; requireHmac: boolean }>({
    kind: 'EA',
    name: '',
    requireHmac: false,
  });
  const [revealed, setRevealed] = useState<ApiKeySecretResult | null>(null);
  const [pendingRevoke, setPendingRevoke] = useState<ApiKeyDTO | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ApiKeyDTO | null>(null);
  const [pendingRotate, setPendingRotate] = useState<ApiKeyDTO | null>(null);

  const keysQuery = useQuery({ queryKey: ['api-keys'], queryFn: apiClient.apiKeys });

  const invalidate = () => Promise.all(
    [['api-keys'], ['accounts'], ['overview'], ['copier']].map(queryKey =>
      queryClient.invalidateQueries({ queryKey }),
    ),
  );

  const deleteMutation = useMutation({
    mutationFn: apiClient.deleteApiKey,
    onSuccess: async (_result, keyId) => {
      await invalidate();
      setPendingDelete(null);
      setRevealed(current => current?.key.id === keyId ? null : current);
      pushToast({ tone: 'success', title: 'Key permanently deleted' });
    },
    onError: () => pushToast({ tone: 'error', title: 'Could not delete the key' }),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      apiClient.createApiKey({
        kind: draft.kind,
        name: draft.name.trim() || `${KIND_LABELS[draft.kind]} key`,
        requireHmac: draft.kind === 'REST' ? draft.requireHmac : false,
      }),
    onSuccess: async (result) => {
      await invalidate();
      setCreateOpen(false);
      setDraft({ kind: 'EA', name: '', requireHmac: false });
      setRevealed(result);
    },
    onError: () => pushToast({ tone: 'error', title: 'Could not create the key' }),
  });

  const rotateMutation = useMutation({
    mutationFn: (keyId: string) => apiClient.rotateApiKey(keyId, 24),
    onSuccess: async (result) => {
      await invalidate();
      setPendingRotate(null);
      setRevealed(result);
    },
    onError: () => pushToast({ tone: 'error', title: 'Could not rotate the key' }),
  });

  const revokeMutation = useMutation({
    mutationFn: (keyId: string) => apiClient.revokeApiKey(keyId),
    onSuccess: async () => {
      await invalidate();
      setPendingRevoke(null);
      pushToast({ tone: 'success', title: 'Key revoked' });
    },
    onError: () => pushToast({ tone: 'error', title: 'Could not revoke the key' }),
  });

  const tradeOpeningMutation = useMutation({
    mutationFn: (enabled: boolean) => apiClient.updateApiTradeOpening(enabled),
    onSuccess: (data) => {
      queryClient.setQueryData(['settings'], data);
      pushToast({
        tone: 'success',
        title: data.allowApiTradeOpening
          ? 'API trade opening enabled'
          : 'API trade opening disabled',
      });
    },
    onError: () => pushToast({ tone: 'error', title: 'Could not change the setting' }),
  });

  const keys = keysQuery.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <Section
        title="API trade opening"
        description="Controls whether a REST key may open new positions on your accounts."
      >
        <Toggle
          label="Allow trade opening through API"
          description="When off, POST /v1/trades/open is rejected with 403. Closing and modifying stay available so a caller can always shut down exposure it already has."
          checked={allowApiTradeOpening}
          onCheckedChange={(next) => tradeOpeningMutation.mutate(next)}
        />
        {allowApiTradeOpening ? (
          <Alert tone="warning" className="mt-4" title="Anyone holding a REST key can open trades">
            Keep REST keys secret, rotate them if one leaks, and prefer a key with request signing
            enabled.
          </Alert>
        ) : null}
      </Section>

      <Section
        title="API keys"
        description="EA keys authenticate a MetaTrader terminal. REST keys authenticate the HTTP trade API."
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            New key
          </Button>
        }
        bodyClassName="p-0 sm:p-0"
      >
        {keysQuery.isLoading ? (
          <div className="space-y-2 p-5">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : keys.length === 0 ? (
          <div className="p-8 text-center">
            <KeyRound className="text-content-tertiary mx-auto h-6 w-6" />
            <p className="text-content-secondary mt-2 text-sm">No API keys yet.</p>
            <p className="text-content-tertiary mt-1 text-xs">
              Create an EA key to connect a MetaTrader terminal.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-line-subtle text-content-tertiary border-b text-xs">
                <tr>
                  <th className="px-5 py-3 font-medium">Key</th>
                  <th className="px-5 py-3 font-medium">Type</th>
                  <th className="px-5 py-3 font-medium">Last used</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {keys.map((key) => {
                  const status = keyStatus(key);
                  const isLive = !key.revokedAt;

                  return (
                    <tr key={key.id} className="border-line-subtle border-b last:border-0">
                      <td className="px-5 py-3">
                        <p className="text-content-primary font-medium">{key.name}</p>
                        <code className="text-content-tertiary font-mono text-xs">
                          {key.prefix}…
                        </code>
                      </td>
                      <td className="text-content-secondary px-5 py-3 text-xs">
                        {KIND_LABELS[key.kind]}
                      </td>
                      <td className="text-content-secondary px-5 py-3 text-xs">
                        {key.lastUsedAt ? formatTimestamp(key.lastUsedAt) : 'Never'}
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={status.tone}>{status.label}</Badge>
                        {key.expiresAt && !key.revokedAt ? (
                          <p className="text-content-tertiary mt-1 text-[11px]">
                            Works until {formatTimestamp(key.expiresAt)}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {isLive ? (
                            <>
                              <button
                                type="button"
                                onClick={() => setPendingRotate(key)}
                                aria-label="Rotate key"
                                title="Rotate"
                                className="text-content-tertiary hover:bg-surface-muted hover:text-content-primary cursor-pointer rounded-lg p-2 transition-colors"
                              >
                                <RefreshCw className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setPendingRevoke(key)}
                                aria-label="Revoke key"
                                title="Revoke"
                                className="text-content-tertiary hover:bg-negative-subtle hover:text-negative-content cursor-pointer rounded-lg p-2 transition-colors"
                              >
                                <Ban className="h-4 w-4" />
                              </button>
                            </>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => setPendingDelete(key)}
                            aria-label={`Delete ${key.name}`}
                            title="Permanently delete key"
                            className="text-content-tertiary hover:bg-negative-subtle hover:text-negative-content cursor-pointer rounded-lg p-2 transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Create */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create an API key"
        description="The secret is shown once and never again."
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => createMutation.mutate()} isLoading={createMutation.isPending}>
              Create key
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Select
            label="Key type"
            value={draft.kind}
            options={[
              { value: 'EA', label: 'Expert Advisor — connects a MetaTrader terminal' },
              { value: 'REST', label: 'REST API — opens and manages trades over HTTP' },
            ]}
            onChange={(event) =>
              setDraft((previous) => ({ ...previous, kind: event.target.value as ApiKeyKind }))
            }
          />
          <Input
            label="Name"
            value={draft.name}
            onChange={(event) =>
              setDraft((previous) => ({ ...previous, name: event.target.value }))
            }
            placeholder={`${KIND_LABELS[draft.kind]} key`}
            hint="Something you'll recognise later, e.g. the terminal or server name"
          />
          {draft.kind === 'REST' ? (
            <Toggle
              label="Require request signing (HMAC)"
              description="Every call must carry a timestamp, a single-use nonce and a signature. Stops a captured request being replayed."
              checked={draft.requireHmac}
              onCheckedChange={(next) =>
                setDraft((previous) => ({ ...previous, requireHmac: next }))
              }
            />
          ) : null}
        </div>
      </Modal>

      {/* One-time reveal */}
      <Modal
        open={revealed !== null}
        onClose={() => setRevealed(null)}
        title="Copy your key now"
        description="This is the only time it will be shown."
        footer={
          <Button onClick={() => setRevealed(null)}>
            I've saved it
          </Button>
        }
      >
        {revealed ? (
          <div className="space-y-4">
            <SecretField label={revealed.key.name} value={revealed.secret} maskable={false} />
            {revealed.hmacSecret ? (
              <SecretField
                label="HMAC signing secret"
                value={revealed.hmacSecret}
                maskable={false}
              />
            ) : null}
            <Alert tone="warning">
              Store it in a password manager or your EA's <code>ApiKey</code> input. TradePilot only
              keeps a hash, so it cannot be recovered.
            </Alert>
            {revealed.key.rotatedFromId ? (
              <Alert tone="info">
                The key it replaces keeps working for 24 hours, so a running EA won't be locked out
                mid-session. Revoke it now if you'd rather cut it off immediately.
              </Alert>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={pendingRotate !== null}
        onClose={() => setPendingRotate(null)}
        onConfirm={() => pendingRotate && rotateMutation.mutate(pendingRotate.id)}
        title="Rotate this key?"
        description="A new secret is issued and shown once. The current key keeps working for 24 hours so you can update your terminals without downtime."
        confirmLabel="Rotate key"
        isLoading={rotateMutation.isPending}
      />

      <ConfirmDialog
        open={pendingRevoke !== null}
        onClose={() => setPendingRevoke(null)}
        onConfirm={() => pendingRevoke && revokeMutation.mutate(pendingRevoke.id)}
        title="Revoke this key?"
        description="It stops working and disconnects EAs using it. The key stays in this list as revoked. Reconnecting requires a new key."
        confirmLabel="Revoke key"
        destructive
        isLoading={revokeMutation.isPending}
      />
      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && deleteMutation.mutate(pendingDelete.id)}
        title="Permanently delete this key?"
        description="This removes the key from the list and disconnects EAs using it. It cannot be undone. Your accounts and trade history are kept."
        confirmLabel="Delete key"
        destructive
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
