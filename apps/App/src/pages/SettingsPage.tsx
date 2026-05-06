import { FormEvent, KeyboardEvent, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { MailCheck, Save, ShieldCheck, Trash2, UserCircle2 } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';

import type {
  NotificationPreferencesDTO,
  SettingsDTO,
  UpdateProfileInput,
} from '@tradepilot/shared';

import { apiClient } from '../lib/api';
import { queryClient } from '../lib/query-client';
import { useAuthStore } from '../store/auth-store';
import { useToastStore } from '../store/toast-store';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Skeleton } from '../components/ui/Skeleton';
import { Toggle } from '../components/ui/Toggle';
import { TelegramPage } from './TelegramPage';

type SettingsTab = 'profile' | 'security' | 'telegram' | 'notifications' | 'trading' | 'billing';

const TABS: Array<{ key: SettingsTab; label: string }> = [
  { key: 'profile', label: 'Profile' },
  { key: 'security', label: 'Security' },
  { key: 'telegram', label: 'Telegram' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'trading', label: 'Trading' },
  { key: 'billing', label: 'Billing' },
];

const MODE_OPTIONS = [
  {
    value: 'AUTO' as const,
    title: 'Auto',
    description: 'Validated signals are dispatched immediately when all safeguards pass.',
  },
  {
    value: 'SEMI_AUTO' as const,
    title: 'Semi-auto',
    description: 'Signals are parsed and validated, but automatic dispatch is blocked.',
  },
  {
    value: 'MANUAL' as const,
    title: 'Manual',
    description: 'Signals are stored only for review and manual actions.',
  },
];

function SettingsSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-[520px] w-full" />
    </div>
  );
}

function normalizeSymbol(symbol: string) {
  return symbol.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function SettingsPage() {
  const [searchParams] = useSearchParams();
  const pushToast = useToastStore((state) => state.push);
  const authUser = useAuthStore((state) => state.user);
  const updateAuthUser = useAuthStore((state) => state.updateUser);
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');

  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: apiClient.settings,
  });

  const profileQuery = useQuery({
    queryKey: ['profile'],
    queryFn: apiClient.profile,
  });

  const notificationsQuery = useQuery({
    queryKey: ['notifications', 'preferences'],
    queryFn: apiClient.notificationPreferences,
  });

  const sessionsQuery = useQuery({
    queryKey: ['security', 'sessions'],
    queryFn: apiClient.sessions,
  });

  const [settingsDraft, setSettingsDraft] = useState<SettingsDTO | null>(null);
  const [profileDraft, setProfileDraft] = useState<{
    fullName: string;
    phoneNumber: string;
    email: string;
    pendingEmail: string;
  } | null>(null);
  const [notificationDraft, setNotificationDraft] = useState<NotificationPreferencesDTO | null>(
    null,
  );
  const [excludedSymbolInput, setExcludedSymbolInput] = useState('');
  const [requestedEmail, setRequestedEmail] = useState('');
  const [emailToken, setEmailToken] = useState('');
  const [passwordDraft, setPasswordDraft] = useState({
    currentPassword: '',
    newPassword: '',
    confirmNewPassword: '',
  });

  useEffect(() => {
    const tab = searchParams.get('tab');
    const token = searchParams.get('emailToken');

    if (
      tab === 'profile' ||
      tab === 'security' ||
      tab === 'telegram' ||
      tab === 'notifications' ||
      tab === 'trading' ||
      tab === 'billing'
    ) {
      setActiveTab(tab as SettingsTab);
    }

    if (token) {
      setEmailToken(token);
      setActiveTab('profile');
    }
  }, [searchParams]);

  useEffect(() => {
    if (settingsQuery.data && !settingsDraft) {
      setSettingsDraft(settingsQuery.data);
    }
  }, [settingsQuery.data, settingsDraft]);

  useEffect(() => {
    if (profileQuery.data && !profileDraft) {
      setProfileDraft({
        fullName: profileQuery.data.fullName ?? '',
        phoneNumber: profileQuery.data.phoneNumber ?? '',
        email: profileQuery.data.email,
        pendingEmail: profileQuery.data.pendingEmail ?? '',
      });
      setRequestedEmail(profileQuery.data.pendingEmail ?? profileQuery.data.email);
    }
  }, [profileQuery.data, profileDraft]);

  useEffect(() => {
    if (notificationsQuery.data && !notificationDraft) {
      setNotificationDraft(notificationsQuery.data);
    }
  }, [notificationsQuery.data, notificationDraft]);

  const settingsMutation = useMutation({
    mutationFn: apiClient.updateSettings,
    onSuccess: (data) => {
      setSettingsDraft(data);
      queryClient.setQueryData(['settings'], data);
      pushToast({
        tone: 'success',
        title: 'Trading settings saved',
        description: 'Risk, symbol exclusions, and execution preferences were updated.',
      });
    },
    onError: () => {
      pushToast({
        tone: 'error',
        title: 'Settings save failed',
        description: 'The latest trading configuration could not be saved.',
      });
    },
  });

  const profileMutation = useMutation({
    mutationFn: (payload: UpdateProfileInput) => apiClient.updateProfile(payload),
    onSuccess: (data) => {
      queryClient.setQueryData(['profile'], data);
      updateAuthUser(data);
      setProfileDraft((previous) =>
        previous
          ? {
              ...previous,
              fullName: data.fullName ?? '',
              phoneNumber: data.phoneNumber ?? '',
              pendingEmail: data.pendingEmail ?? '',
              email: data.email,
            }
          : null,
      );
      pushToast({
        tone: 'success',
        title: 'Profile updated',
      });
    },
    onError: () => {
      pushToast({
        tone: 'error',
        title: 'Profile update failed',
      });
    },
  });

  const requestEmailChangeMutation = useMutation({
    mutationFn: apiClient.requestEmailChange,
    onSuccess: (data) => {
      queryClient.setQueryData(['profile'], data);
      updateAuthUser(data);
      setProfileDraft((previous) =>
        previous
          ? {
              ...previous,
              email: data.email,
              pendingEmail: data.pendingEmail ?? '',
            }
          : null,
      );
      pushToast({
        tone: 'success',
        title: 'Verification email sent',
        description: 'Open the verification link sent to your new email address.',
      });
    },
    onError: () => {
      pushToast({
        tone: 'error',
        title: 'Email change request failed',
      });
    },
  });

  const verifyEmailMutation = useMutation({
    mutationFn: apiClient.verifyEmailChange,
    onSuccess: (data) => {
      queryClient.setQueryData(['profile'], data);
      updateAuthUser(data);
      setProfileDraft((previous) =>
        previous
          ? {
              ...previous,
              email: data.email,
              pendingEmail: data.pendingEmail ?? '',
            }
          : null,
      );
      setEmailToken('');
      pushToast({
        tone: 'success',
        title: 'Email address updated',
      });
    },
    onError: () => {
      pushToast({
        tone: 'error',
        title: 'Email verification failed',
      });
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: apiClient.changePassword,
    onSuccess: () => {
      setPasswordDraft({
        currentPassword: '',
        newPassword: '',
        confirmNewPassword: '',
      });
      pushToast({
        tone: 'success',
        title: 'Password updated',
      });
    },
    onError: () => {
      pushToast({
        tone: 'error',
        title: 'Password update failed',
        description: 'Check your current password and try again.',
      });
    },
  });

  const logoutAllMutation = useMutation({
    mutationFn: apiClient.logoutAllSessions,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['security', 'sessions'] });
      pushToast({
        tone: 'success',
        title: 'All sessions revoked',
      });
    },
    onError: () => {
      pushToast({
        tone: 'error',
        title: 'Could not revoke sessions',
      });
    },
  });

  const notificationMutation = useMutation({
    mutationFn: apiClient.updateNotificationPreferences,
    onSuccess: (data) => {
      setNotificationDraft(data);
      queryClient.setQueryData(['notifications', 'preferences'], data);
      pushToast({
        tone: 'success',
        title: 'Notification preferences saved',
      });
    },
    onError: () => {
      pushToast({
        tone: 'error',
        title: 'Notification update failed',
      });
    },
  });

  const addExcludedSymbol = () => {
    if (!settingsDraft) {
      return;
    }

    const normalized = normalizeSymbol(excludedSymbolInput);
    if (!normalized) {
      return;
    }

    if (settingsDraft.excludedSymbols.includes(normalized)) {
      setExcludedSymbolInput('');
      return;
    }

    setSettingsDraft({
      ...settingsDraft,
      excludedSymbols: [...settingsDraft.excludedSymbols, normalized],
    });
    setExcludedSymbolInput('');
  };

  const removeExcludedSymbol = (symbol: string) => {
    if (!settingsDraft) {
      return;
    }

    setSettingsDraft({
      ...settingsDraft,
      excludedSymbols: settingsDraft.excludedSymbols.filter((item) => item !== symbol),
    });
  };

  const onExcludedSymbolKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') {
      return;
    }
    event.preventDefault();
    addExcludedSymbol();
  };

  const settingsDirty = useMemo(() => {
    if (!settingsDraft || !settingsQuery.data) {
      return false;
    }
    return JSON.stringify(settingsDraft) !== JSON.stringify(settingsQuery.data);
  }, [settingsDraft, settingsQuery.data]);

  const notificationsDirty = useMemo(() => {
    if (!notificationDraft || !notificationsQuery.data) {
      return false;
    }
    return JSON.stringify(notificationDraft) !== JSON.stringify(notificationsQuery.data);
  }, [notificationDraft, notificationsQuery.data]);

  if (
    settingsQuery.isLoading ||
    profileQuery.isLoading ||
    notificationsQuery.isLoading ||
    !settingsDraft ||
    !profileDraft ||
    !notificationDraft
  ) {
    return <SettingsSkeleton />;
  }

  return (
    <div className="space-y-5">
      <Card
        title="Workspace Settings"
        eyebrow="Account"
        description="Manage your profile, security, Telegram integration, notifications, trading controls, and billing."
      >
        <div className="flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={[
                'rounded-xl border px-3 py-2 text-sm font-medium transition-colors',
                activeTab === tab.key
                  ? 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-300'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-700',
              ].join(' ')}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </Card>

      {activeTab === 'profile' ? (
        <div className="space-y-5">
          <Card
            title="Profile"
            eyebrow="Identity"
            description="Update your display details and manage email verification."
            actions={<UserCircle2 className="h-4 w-4 text-sky-500" />}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Input
                label="Full name"
                value={profileDraft.fullName}
                onChange={(event) =>
                  setProfileDraft((previous) =>
                    previous ? { ...previous, fullName: event.target.value } : previous,
                  )
                }
                placeholder="Your full name"
              />
              <Input
                label="Phone number"
                value={profileDraft.phoneNumber}
                onChange={(event) =>
                  setProfileDraft((previous) =>
                    previous ? { ...previous, phoneNumber: event.target.value } : previous,
                  )
                }
                placeholder="+15551234567"
              />
              <Input
                label="Current email"
                value={profileDraft.email}
                onChange={() => undefined}
                disabled
              />
              <Input
                label="Pending email"
                value={profileDraft.pendingEmail || '--'}
                onChange={() => undefined}
                disabled
              />
            </div>
            <div className="mt-4 flex justify-end">
              <Button
                onClick={() =>
                  profileMutation.mutate({
                    fullName: profileDraft.fullName || null,
                    phoneNumber: profileDraft.phoneNumber || null,
                  })
                }
                isLoading={profileMutation.isPending}
              >
                <Save className="h-3.5 w-3.5" />
                Save profile
              </Button>
            </div>
          </Card>

          <Card
            title="Email Change Verification"
            eyebrow="SMTP Workflow"
            description="Request an email change and confirm with the verification token sent to your new address."
            actions={<MailCheck className="h-4 w-4 text-sky-500" />}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Input
                label="New email address"
                type="email"
                value={requestedEmail}
                onChange={(event) => setRequestedEmail(event.target.value)}
                placeholder="new@email.com"
              />
              <Input
                label="Verification token"
                value={emailToken}
                onChange={(event) => setEmailToken(event.target.value)}
                placeholder="Paste token if needed"
              />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => requestEmailChangeMutation.mutate({ newEmail: requestedEmail })}
                isLoading={requestEmailChangeMutation.isPending}
                disabled={!requestedEmail.trim()}
              >
                Request verification
              </Button>
              <Button
                onClick={() => verifyEmailMutation.mutate({ token: emailToken })}
                isLoading={verifyEmailMutation.isPending}
                disabled={!emailToken.trim()}
              >
                Verify email token
              </Button>
            </div>
          </Card>
        </div>
      ) : null}

      {activeTab === 'security' ? (
        <div className="space-y-5">
          <Card
            title="Password"
            eyebrow="Security"
            description="Rotate your account password after validating the current password."
            actions={<ShieldCheck className="h-4 w-4 text-sky-500" />}
          >
            <form
              className="grid gap-4 md:grid-cols-3"
              onSubmit={(event: FormEvent) => {
                event.preventDefault();
                if (passwordDraft.newPassword !== passwordDraft.confirmNewPassword) {
                  pushToast({
                    tone: 'error',
                    title: 'Password mismatch',
                    description: 'New password and confirmation must match.',
                  });
                  return;
                }
                changePasswordMutation.mutate({
                  currentPassword: passwordDraft.currentPassword,
                  newPassword: passwordDraft.newPassword,
                });
              }}
            >
              <Input
                type="password"
                label="Current password"
                value={passwordDraft.currentPassword}
                onChange={(event) =>
                  setPasswordDraft((previous) => ({
                    ...previous,
                    currentPassword: event.target.value,
                  }))
                }
              />
              <Input
                type="password"
                label="New password"
                value={passwordDraft.newPassword}
                onChange={(event) =>
                  setPasswordDraft((previous) => ({
                    ...previous,
                    newPassword: event.target.value,
                  }))
                }
              />
              <Input
                type="password"
                label="Confirm new password"
                value={passwordDraft.confirmNewPassword}
                onChange={(event) =>
                  setPasswordDraft((previous) => ({
                    ...previous,
                    confirmNewPassword: event.target.value,
                  }))
                }
              />
              <div className="md:col-span-3 flex justify-end">
                <Button type="submit" isLoading={changePasswordMutation.isPending}>
                  Update password
                </Button>
              </div>
            </form>
          </Card>

          <Card
            title="Active Sessions"
            eyebrow="Session Control"
            description="Review active sessions and invalidate all sessions when needed."
          >
            <div className="space-y-3">
              {(sessionsQuery.data ?? []).map((session) => (
                <div
                  key={session.id}
                  className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-950/60"
                >
                  <p className="font-medium text-slate-900 dark:text-slate-100">
                    {session.userAgent ?? 'Unknown agent'}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {session.ipAddress ?? 'Unknown IP'} • Last seen{' '}
                    {new Date(session.lastSeenAt).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <Button
                variant="danger"
                onClick={() => logoutAllMutation.mutate()}
                isLoading={logoutAllMutation.isPending}
              >
                Logout all devices
              </Button>
            </div>
          </Card>
        </div>
      ) : null}

      {activeTab === 'telegram' ? <TelegramPage /> : null}

      {activeTab === 'notifications' ? (
        <div className="space-y-5">
          <Card
            title="Notification Channels"
            eyebrow="Delivery"
            description="Choose where alerts are sent."
          >
            <div className="space-y-2">
              <Toggle
                label="Email"
                checked={notificationDraft.channels.email}
                onCheckedChange={(value) =>
                  setNotificationDraft((previous) =>
                    previous
                      ? { ...previous, channels: { ...previous.channels, email: value } }
                      : previous,
                  )
                }
              />
              <Toggle
                label="Telegram Bot"
                checked={notificationDraft.channels.telegram}
                onCheckedChange={(value) =>
                  setNotificationDraft((previous) =>
                    previous
                      ? { ...previous, channels: { ...previous.channels, telegram: value } }
                      : previous,
                  )
                }
              />
              <Toggle
                label="WhatsApp (future)"
                checked={notificationDraft.channels.whatsapp}
                onCheckedChange={(value) =>
                  setNotificationDraft((previous) =>
                    previous
                      ? { ...previous, channels: { ...previous.channels, whatsapp: value } }
                      : previous,
                  )
                }
              />
            </div>
          </Card>

          <Card
            title="Alert Events"
            eyebrow="Preferences"
            description="Choose which trading events trigger notifications."
          >
            <div className="space-y-2">
              {(
                [
                  ['newTradeOpened', 'New trade opened'],
                  ['tpHit', 'TP hit'],
                  ['slHit', 'SL hit'],
                  ['lowMargin', 'Low margin'],
                  ['eaDisconnected', 'EA disconnected'],
                  ['telegramDisconnected', 'Telegram disconnected'],
                  ['executionFailed', 'Execution failed'],
                  ['dailySummary', 'Daily summary'],
                ] as const
              ).map(([key, label]) => (
                <Toggle
                  key={key}
                  label={label}
                  checked={notificationDraft.events[key]}
                  onCheckedChange={(value) =>
                    setNotificationDraft((previous) =>
                      previous
                        ? { ...previous, events: { ...previous.events, [key]: value } }
                        : previous,
                    )
                  }
                />
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <Button
                onClick={() => notificationMutation.mutate(notificationDraft)}
                isLoading={notificationMutation.isPending}
                disabled={!notificationsDirty}
              >
                <Save className="h-3.5 w-3.5" />
                Save notifications
              </Button>
            </div>
          </Card>
        </div>
      ) : null}

      {activeTab === 'trading' ? (
        <div className="space-y-5">
          <Card
            title="Execution Mode"
            eyebrow="Safety"
            description="Control how TradePilot dispatches parsed signals."
          >
            <div className="grid gap-3 md:grid-cols-3">
              {MODE_OPTIONS.map((option) => {
                const selected = settingsDraft.mode === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() =>
                      setSettingsDraft((previous) =>
                        previous ? { ...previous, mode: option.value } : previous,
                      )
                    }
                    className={[
                      'rounded-xl border px-4 py-4 text-left transition-colors',
                      selected
                        ? 'border-blue-500 bg-blue-50 dark:border-blue-500 dark:bg-blue-500/10'
                        : 'border-gray-200 bg-white hover:border-gray-300 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600',
                    ].join(' ')}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">{option.title}</p>
                      <Badge tone={selected ? 'info' : 'neutral'}>{option.value}</Badge>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-slate-400">
                      {option.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </Card>

          <Card
            title="Risk Controls"
            eyebrow="Limits"
            description="Set hard caps that can block or pause execution."
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Input
                type="number"
                label="Risk per trade (%)"
                value={String(settingsDraft.riskPercent)}
                onChange={(event) =>
                  setSettingsDraft((previous) =>
                    previous
                      ? { ...previous, riskPercent: Number(event.target.value) || 0.1 }
                      : previous,
                  )
                }
              />
              <Input
                type="number"
                label="Max simultaneous trades"
                value={String(settingsDraft.maxSimultaneousTrades)}
                onChange={(event) =>
                  setSettingsDraft((previous) =>
                    previous
                      ? {
                          ...previous,
                          maxSimultaneousTrades: Number(event.target.value) || 1,
                          maxTrades: Number(event.target.value) || 1,
                        }
                      : previous,
                  )
                }
              />
              <Input
                type="number"
                label="Max daily loss (%)"
                value={String(settingsDraft.maxDailyLossPercent)}
                onChange={(event) =>
                  setSettingsDraft((previous) =>
                    previous
                      ? { ...previous, maxDailyLossPercent: Number(event.target.value) || 1 }
                      : previous,
                  )
                }
              />
              <Input
                type="number"
                label="Max trades per day"
                value={String(settingsDraft.maxTradesPerDay)}
                onChange={(event) =>
                  setSettingsDraft((previous) =>
                    previous
                      ? { ...previous, maxTradesPerDay: Number(event.target.value) || 1 }
                      : previous,
                  )
                }
              />
              <Input
                type="number"
                label="Low margin threshold (%)"
                value={String(settingsDraft.lowMarginThresholdPercent)}
                onChange={(event) =>
                  setSettingsDraft((previous) =>
                    previous
                      ? {
                          ...previous,
                          lowMarginThresholdPercent: Number(event.target.value) || 1,
                        }
                      : previous,
                  )
                }
              />
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-300">
                {settingsDraft.executionPaused ? (
                  <span>
                    Execution paused by failsafe: {settingsDraft.executionPauseReason ?? 'UNKNOWN'}
                  </span>
                ) : (
                  <span>Execution active</span>
                )}
              </div>
            </div>
          </Card>

          <Card
            title="Excluded Symbols"
            eyebrow="Default allowlist behavior"
            description="All symbols are tradable by default. Add only symbols that must be blocked."
          >
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
              <Input
                label="Add excluded symbol"
                value={excludedSymbolInput}
                onChange={(event) => setExcludedSymbolInput(event.target.value)}
                onKeyDown={onExcludedSymbolKeyDown}
                placeholder="e.g. GBPUSD"
              />
              <div className="pt-7">
                <Button onClick={addExcludedSymbol}>Add</Button>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {settingsDraft.excludedSymbols.length === 0 ? (
                <span className="text-sm text-slate-500 dark:text-slate-400">No excluded symbols.</span>
              ) : (
                settingsDraft.excludedSymbols.map((symbol) => (
                  <button
                    key={symbol}
                    type="button"
                    onClick={() => removeExcludedSymbol(symbol)}
                    className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
                  >
                    {symbol}
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                ))
              )}
            </div>
          </Card>

          <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {settingsDirty ? 'Unsaved trading changes' : 'Trading settings synced'}
            </div>
            <Button
              onClick={() => settingsMutation.mutate(settingsDraft)}
              isLoading={settingsMutation.isPending}
              disabled={!settingsDirty}
            >
              <Save className="h-3.5 w-3.5" />
              Save trading settings
            </Button>
          </div>
        </div>
      ) : null}

      {activeTab === 'billing' ? (
        <Card
          title="Billing"
          eyebrow="Coming soon"
          description="Subscription management endpoints are prepared for launch integration."
        >
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
            Billing automation, invoices, and plan changes will be enabled in this tab in the next release.
          </div>
        </Card>
      ) : null}

      {authUser?.pendingEmail ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          Pending email change: {authUser.pendingEmail}. Verify the token to finalize the update.
        </div>
      ) : null}
    </div>
  );
}
