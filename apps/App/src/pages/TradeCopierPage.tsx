import { FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCircle2, Copy, KeyRound, RotateCcw, ShieldCheck, UsersRound, Wifi } from 'lucide-react';

import type { CopierProgramDTO, FollowerDeviceDTO } from '@tradepilot/shared';

import { Badge, type BadgeTone } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Skeleton } from '../components/ui/Skeleton';
import { apiClient } from '../lib/api';
import { queryClient } from '../lib/query-client';
import { useToastStore } from '../store/toast-store';

function programStatusTone(status: CopierProgramDTO['status']): BadgeTone {
  if (status === 'ACTIVE') return 'positive';
  if (status === 'PAUSED') return 'warning';
  return 'danger';
}

function followerStatusTone(status: FollowerDeviceDTO['status']): BadgeTone {
  if (status === 'ACTIVE') return 'positive';
  if (status === 'PENDING_APPROVAL') return 'warning';
  return 'danger';
}

function TradeCopierSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-72 w-full" />
    </div>
  );
}

export function TradeCopierPage() {
  const pushToast = useToastStore((state) => state.push);
  const [programName, setProgramName] = useState('');
  const [description, setDescription] = useState('');
  const [maxFollowerDevices, setMaxFollowerDevices] = useState(10);
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null);

  const programsQuery = useQuery({
    queryKey: ['trade-copier', 'programs'],
    queryFn: apiClient.copierPrograms,
  });

  const programs = programsQuery.data ?? [];
  const selectedProgram = useMemo(
    () => programs.find((program) => program.id === selectedProgramId) ?? programs[0] ?? null,
    [programs, selectedProgramId],
  );

  const followersQuery = useQuery({
    queryKey: ['trade-copier', 'followers', selectedProgram?.id],
    queryFn: () => apiClient.copierFollowers(selectedProgram!.id),
    enabled: Boolean(selectedProgram?.id),
  });

  const createProgramMutation = useMutation({
    mutationFn: apiClient.createCopierProgram,
    onSuccess: async (program) => {
      setProgramName('');
      setDescription('');
      setMaxFollowerDevices(10);
      setRequiresApproval(false);
      setSelectedProgramId(program.id);
      await queryClient.invalidateQueries({ queryKey: ['trade-copier', 'programs'] });
      pushToast({ tone: 'success', title: 'Copier program created', description: 'Share the invite code with your Telegram clients.' });
    },
    onError: () => {
      pushToast({ tone: 'error', title: 'Could not create copier program' });
    },
  });

  const rotateCodeMutation = useMutation({
    mutationFn: apiClient.rotateCopierInviteCode,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['trade-copier', 'programs'] });
      pushToast({ tone: 'success', title: 'Invite code rotated' });
    },
    onError: () => {
      pushToast({ tone: 'error', title: 'Could not rotate invite code' });
    },
  });

  const updateProgramMutation = useMutation({
    mutationFn: ({ programId, status }: { programId: string; status: CopierProgramDTO['status'] }) =>
      apiClient.updateCopierProgram(programId, { status }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['trade-copier', 'programs'] });
      pushToast({ tone: 'success', title: 'Program status updated' });
    },
    onError: () => {
      pushToast({ tone: 'error', title: 'Could not update program status' });
    },
  });

  const followerMutation = useMutation({
    mutationFn: ({ action, programId, deviceId }: { action: 'approve' | 'revoke'; programId: string; deviceId: string }) =>
      action === 'approve'
        ? apiClient.approveCopierFollower(programId, deviceId)
        : apiClient.revokeCopierFollower(programId, deviceId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['trade-copier', 'followers'] });
      await queryClient.invalidateQueries({ queryKey: ['trade-copier', 'programs'] });
      pushToast({ tone: 'success', title: 'Follower updated' });
    },
    onError: () => {
      pushToast({ tone: 'error', title: 'Could not update follower' });
    },
  });

  const submitProgram = (event: FormEvent) => {
    event.preventDefault();
    createProgramMutation.mutate({
      name: programName,
      description: description.trim() || null,
      maxFollowerDevices,
      requiresApproval,
    });
  };

  const copyInviteCode = async (code: string | null) => {
    if (!code) return;
    await navigator.clipboard.writeText(code);
    pushToast({ tone: 'success', title: 'Invite code copied', description: 'Send it with the EA download link to your Telegram clients.' });
  };

  if (programsQuery.isLoading) {
    return <TradeCopierSkeleton />;
  }

  return (
    <div className="space-y-6">
      <Card
        eyebrow="Community copier"
        title="Provider invite-code copier"
        description="You pay TradePilot, your Telegram clients enter your code in the EA, and their devices receive your trades without needing full TradePilot accounts."
      >
        <div className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
          <form className="space-y-4" onSubmit={submitProgram}>
            <Input
              label="Program name"
              placeholder="Yassine Gold Signals"
              value={programName}
              onChange={(event) => setProgramName(event.target.value)}
              required
            />
            <Input
              label="Short description"
              placeholder="London/New York XAUUSD copier"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Follower device limit"
                type="number"
                min={1}
                max={500}
                value={maxFollowerDevices}
                onChange={(event) => setMaxFollowerDevices(Number(event.target.value))}
              />
              <label className="flex items-center gap-3 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700 dark:border-slate-800 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={requiresApproval}
                  onChange={(event) => setRequiresApproval(event.target.checked)}
                />
                Manual follower approval
              </label>
            </div>
            <Button type="submit" isLoading={createProgramMutation.isPending} disabled={!programName.trim()}>
              Create copier program
            </Button>
          </form>

          <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4 dark:border-blue-500/20 dark:bg-blue-500/10">
            <div className="flex items-center gap-2 text-sm font-semibold text-blue-800 dark:text-blue-200">
              <ShieldCheck className="h-4 w-4" />
              Safe V1 security model
            </div>
            <ul className="mt-3 space-y-2 text-sm text-blue-900/75 dark:text-blue-100/75">
              <li>• Never share your provider API key with followers.</li>
              <li>• Followers only use an invite code once to get a scoped device token.</li>
              <li>• Codes can be rotated, devices can be approved or revoked.</li>
              <li>• Provider and follower MetaTrader terminals must stay online.</li>
            </ul>
          </div>
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
        <Card title="Your copier programs" description="Create one program per Telegram room, VIP tier, or strategy.">
          {programs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-300 p-6 text-sm text-gray-500 dark:border-slate-700 dark:text-slate-400">
              No copier programs yet. Create one above to generate your first invite code.
            </div>
          ) : (
            <div className="space-y-3">
              {programs.map((program) => (
                <button
                  key={program.id}
                  type="button"
                  onClick={() => setSelectedProgramId(program.id)}
                  className={`w-full rounded-2xl border p-4 text-left transition ${selectedProgram?.id === program.id ? 'border-blue-400 bg-blue-50 dark:border-blue-500 dark:bg-blue-500/10' : 'border-gray-200 hover:border-gray-300 dark:border-slate-800 dark:hover:border-slate-700'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-gray-950 dark:text-white">{program.name}</p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">{program.description || 'No description'}</p>
                    </div>
                    <Badge tone={programStatusTone(program.status)} dot>{program.status}</Badge>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-xs text-gray-500 dark:text-slate-400">
                    <span><UsersRound className="mb-1 h-4 w-4" />{program.followerCount}/{program.maxFollowerDevices} devices</span>
                    <span><Wifi className="mb-1 h-4 w-4" />{program.onlineFollowerCount} online</span>
                    <span><KeyRound className="mb-1 h-4 w-4" />{program.activeInviteCode ?? 'No code'}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card
          title={selectedProgram ? selectedProgram.name : 'Follower devices'}
          description="Anonymous EA devices that joined with your code. Followers do not need full TradePilot accounts in V1."
          actions={
            selectedProgram ? (
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => copyInviteCode(selectedProgram.activeInviteCode)}>
                  <Copy className="h-3.5 w-3.5" /> Copy code
                </Button>
                <Button size="sm" variant="ghost" onClick={() => rotateCodeMutation.mutate(selectedProgram.id)} isLoading={rotateCodeMutation.isPending}>
                  <RotateCcw className="h-3.5 w-3.5" /> Rotate
                </Button>
              </div>
            ) : null
          }
        >
          {selectedProgram ? (
            <div className="space-y-4">
              <div className="grid gap-3 rounded-2xl border border-gray-200 p-4 dark:border-slate-800 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-gray-500 dark:text-slate-400">Invite code</p>
                  <p className="mt-1 font-mono text-lg font-semibold text-gray-950 dark:text-white">{selectedProgram.activeInviteCode ?? '--'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-slate-400">Approval</p>
                  <p className="mt-1 text-sm font-semibold text-gray-950 dark:text-white">{selectedProgram.requiresApproval ? 'Manual' : 'Auto-approve'}</p>
                </div>
                <div className="flex items-end gap-2">
                  <Button
                    size="sm"
                    variant={selectedProgram.status === 'ACTIVE' ? 'secondary' : 'primary'}
                    onClick={() => updateProgramMutation.mutate({ programId: selectedProgram.id, status: selectedProgram.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE' })}
                  >
                    {selectedProgram.status === 'ACTIVE' ? 'Pause program' : 'Activate program'}
                  </Button>
                </div>
              </div>

              {followersQuery.isLoading ? (
                <Skeleton className="h-48 w-full" />
              ) : (followersQuery.data ?? []).length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-300 p-6 text-sm text-gray-500 dark:border-slate-700 dark:text-slate-400">
                  No follower devices yet. Send the EA download link and code to your Telegram clients.
                </div>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-slate-800">
                  {(followersQuery.data ?? []).map((device) => (
                    <div key={device.id} className="grid gap-3 border-b border-gray-100 p-4 last:border-b-0 dark:border-slate-800 md:grid-cols-[1fr_auto]">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-gray-950 dark:text-white">{device.nickname || 'Unnamed device'}</p>
                          <Badge tone={followerStatusTone(device.status)} dot>{device.status.replace(/_/g, ' ')}</Badge>
                        </div>
                        <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                          {device.platform ?? 'MT'} • {device.brokerServer ?? 'Unknown broker'} • {device.accountLoginMasked ?? 'Masked account'} • Last seen {device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString() : 'never'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {device.status === 'PENDING_APPROVAL' ? (
                          <Button size="sm" variant="secondary" onClick={() => followerMutation.mutate({ action: 'approve', programId: selectedProgram.id, deviceId: device.id })}>
                            <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                          </Button>
                        ) : null}
                        {device.status !== 'REVOKED' ? (
                          <Button size="sm" variant="danger" onClick={() => followerMutation.mutate({ action: 'revoke', programId: selectedProgram.id, deviceId: device.id })}>
                            Revoke
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-gray-300 p-6 text-sm text-gray-500 dark:border-slate-700 dark:text-slate-400">
              Select or create a copier program to manage invite codes and follower devices.
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
