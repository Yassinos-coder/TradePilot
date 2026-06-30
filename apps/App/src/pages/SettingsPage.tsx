import { FormEvent, KeyboardEvent, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  BellRing,
  MailCheck,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  UserCircle2,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';

import type {
  NotificationPreferencesDTO,
  SettingsDTO,
  UpdateProfileInput,
} from '@tradepilot/shared';

import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Skeleton } from '../components/ui/Skeleton';
import { Toggle } from '../components/ui/Toggle';
import { apiClient } from '../lib/api';
import { cn } from '../lib/utils';
import { queryClient } from '../lib/query-client';
import { useAuthStore } from '../store/auth-store';
import { useToastStore } from '../store/toast-store';
import { TelegramPage } from './TelegramPage';

type SettingsTab = 'profile' | 'security' | 'telegram' | 'notifications' | 'trading' | 'billing';

const TABS: Array<{ key: SettingsTab; label: string; description: string }> = [
  { key: 'profile', label: 'Profile', description: 'Identity, contact details, and email ownership.' },
  { key: 'security', label: 'Security', description: 'Password rotation and active session control.' },
  { key: 'telegram', label: 'Telegram', description: 'Account connection and channel management.' },
  { key: 'notifications', label: 'Notifications', description: 'Delivery channels, alerts, and event preferences.' },
  { key: 'trading', label: 'Trading', description: 'Execution mode, risk limits, and blocked symbols.' },
  { key: 'billing', label: 'Billing', description: 'Subscription and plan management.' },
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

type NotificationChannelOption = {
  key: keyof NotificationPreferencesDTO['channels'];
  label: string;
  description: string;
  disabled?: boolean;
};

type NotificationEventOption = {
  key: keyof NotificationPreferencesDTO['events'];
  label: string;
  description: string;
  disabled?: boolean;
};

const NOTIFICATION_CHANNEL_OPTIONS: NotificationChannelOption[] = [
  {
    key: 'email',
    label: 'Email',
    description: 'Receive branded inbox alerts for execution, protection, and account activity.',
  },
  {
    key: 'telegram',
    label: 'Telegram Bot',
    description: 'Mirror critical alerts inside your Telegram workflow and team channels.',
  },
  {
    key: 'whatsapp',
    label: 'WhatsApp',
    description: 'Reserved for the next notification channel rollout.',
    disabled: true,
  },
] as const;

const NOTIFICATION_EVENT_OPTIONS: NotificationEventOption[] = [
  {
    key: 'newTradeOpened',
    label: 'New trade opened',
    description: 'Confirm when TradePilot successfully opens a new position.',
  },
  {
    key: 'tpHit',
    label: 'Take profit hit',
    description: 'Celebrate profitable closures the moment the TP is reached.',
  },
  {
    key: 'slHit',
    label: 'Stop loss hit',
    description: 'Know immediately when a protection stop closes the trade.',
  },
  {
    key: 'lowMargin',
    label: 'Low margin protection',
    description: 'Warn when free margin drops near your configured safety threshold.',
  },
  {
    key: 'eaDisconnected',
    label: 'EA disconnected',
    description: 'Alert when no authenticated MetaTrader connection remains online.',
  },
  {
    key: 'telegramDisconnected',
    label: 'Telegram disconnected',
    description: 'Warn when Telegram goes offline and signal execution is blocked.',
  },
  {
    key: 'executionFailed',
    label: 'Execution failed',
    description: 'Capture symbol mapping issues, dispatch failures, and command errors.',
  },
  {
    key: 'dailySummary',
    label: 'Daily summary',
    description: 'Reserved for a scheduled recap digest.',
    disabled: true,
  },
] as const;

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

function formatModeLabel(mode: SettingsDTO['mode']) {
  return mode === 'SEMI_AUTO' ? 'Semi-auto' : mode === 'AUTO' ? 'Auto' : 'Manual';
}

export function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
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

  const currentTab = TABS.find((tab) => tab.key === activeTab) ?? TABS[0]!;
  const enabledChannelCount = notificationDraft
    ? Object.values(notificationDraft.channels).filter(Boolean).length
    : 0;
  const enabledEventCount = notificationDraft
    ? Object.values(notificationDraft.events).filter(Boolean).length
    : 0;
  const workspaceStats = [
    {
      label: 'Enabled channels',
      value: `${enabledChannelCount}/${NOTIFICATION_CHANNEL_OPTIONS.length}`,
      icon: BellRing,
    },
    {
      label: 'Alert events',
      value: `${enabledEventCount}/${NOTIFICATION_EVENT_OPTIONS.length}`,
      icon: MailCheck,
    },
    {
      label: 'Trading mode',
      value: settingsDraft ? formatModeLabel(settingsDraft.mode) : '--',
      icon: SlidersHorizontal,
    },
  ] as const;

  const selectTab = (tab: SettingsTab) => {
    setActiveTab(tab);
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set('tab', tab);
      return next;
    });
  };


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
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[30px] border border-slate-200/80 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.16),_transparent_36%),linear-gradient(135deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] shadow-sm dark:border-slate-800 dark:bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.16),_transparent_32%),linear-gradient(135deg,rgba(15,23,42,0.98),rgba(15,23,42,0.94))]">
        <div className="space-y-6 px-6 py-6 lg:px-8 lg:py-8">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="space-y-3">
              <Badge tone="info">Workspace settings</Badge>
              <div className="space-y-2">
                <h1 className="text-3xl font-semibold tracking-tight text-slate-950 dark:text-slate-50">
                  Smooth controls for profile, alerts, and execution
                </h1>
                <p className="max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                  Move through settings quickly, keep context while you scroll, and make changes
                  without bouncing between disconnected cards.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge tone="neutral">{currentTab.label}</Badge>
                <Badge tone={settingsDraft.executionPaused ? 'warning' : 'positive'} dot>
                  {settingsDraft.executionPaused ? 'Execution paused' : 'Execution active'}
                </Badge>
                {authUser?.pendingEmail ? <Badge tone="warning">Pending email change</Badge> : null}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[430px]">
              {workspaceStats.map((stat) => {
                const Icon = stat.icon;
                return (
                  <div
                    key={stat.label}
                    className="rounded-2xl border border-white/80 bg-white/80 px-4 py-3 backdrop-blur dark:border-slate-800/80 dark:bg-slate-950/75"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
                        {stat.label}
                      </p>
                      <Icon className="h-4 w-4 text-sky-600 dark:text-sky-300" />
                    </div>
                    <p className="mt-2 text-lg font-semibold tracking-tight text-slate-950 dark:text-slate-100">
                      {stat.value}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="overflow-x-auto">
            <div className="inline-flex min-w-full gap-2 rounded-[22px] border border-slate-200/80 bg-white/75 p-2 backdrop-blur dark:border-slate-800 dark:bg-slate-950/70">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => selectTab(tab.key)}
                  className={cn(
                    'min-w-[170px] flex-1 rounded-2xl px-4 py-3 text-left transition-all',
                    activeTab === tab.key
                      ? 'bg-slate-950 text-white shadow-sm dark:bg-slate-100 dark:text-slate-950'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-100',
                  )}
                >
                  <p className="text-sm font-semibold">{tab.label}</p>
                  <p
                    className={cn(
                      'mt-1 text-xs leading-5',
                      activeTab === tab.key
                        ? 'text-white/80 dark:text-slate-600'
                        : 'text-slate-500 dark:text-slate-400',
                    )}
                  >
                    {tab.description}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div>
        <main className="space-y-5">
          {activeTab === 'profile' ? (
            <div className="space-y-5">
              <section id="profile-identity" className="scroll-mt-28">
                <Card
                  title="Identity"
                  eyebrow="Profile"
                  description="Update the account owner details used across the platform."
                  actions={<UserCircle2 className="h-4 w-4 text-sky-500" />}
                  className="rounded-[24px]"
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
                  <div className="mt-5 flex justify-end">
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
              </section>

              <section id="profile-email" className="scroll-mt-28">
                <Card
                  title="Email Verification"
                  eyebrow="Notification Identity"
                  description="Request an email change and verify it from the secure link or token."
                  actions={<MailCheck className="h-4 w-4 text-sky-500" />}
                  className="rounded-[24px]"
                >
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_260px]">
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
                    <div className="rounded-2xl border border-sky-100 bg-sky-50 px-4 py-4 text-xs leading-5 text-sky-900 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-100">
                      Beautiful account emails now use the same notification system, so ownership
                      changes feel consistent with your trading alerts.
                    </div>
                  </div>
                  <div className="mt-5 flex flex-wrap gap-2">
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
              </section>
            </div>
          ) : null}

          {activeTab === 'security' ? (
            <div className="space-y-5">
              <section id="security-password" className="scroll-mt-28">
                <Card
                  title="Password"
                  eyebrow="Security"
                  description="Rotate your password after validating the current secret."
                  actions={<ShieldCheck className="h-4 w-4 text-sky-500" />}
                  className="rounded-[24px]"
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
                    <div className="flex justify-end md:col-span-3">
                      <Button type="submit" isLoading={changePasswordMutation.isPending}>
                        Update password
                      </Button>
                    </div>
                  </form>
                </Card>
              </section>

              <section id="security-sessions" className="scroll-mt-28">
                <Card
                  title="Active Sessions"
                  eyebrow="Session Control"
                  description="Review where your account is active and revoke every device if needed."
                  className="rounded-[24px]"
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
                          {session.ipAddress ?? 'Unknown IP'} | Last seen{' '}
                          {new Date(session.lastSeenAt).toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-5 flex justify-end">
                    <Button
                      variant="danger"
                      onClick={() => logoutAllMutation.mutate()}
                      isLoading={logoutAllMutation.isPending}
                    >
                      Logout all devices
                    </Button>
                  </div>
                </Card>
              </section>
            </div>
          ) : null}

          {activeTab === 'telegram' ? (
            <section id="telegram-connection" className="scroll-mt-28">
              <TelegramPage />
            </section>
          ) : null}

          {activeTab === 'notifications' ? (
            <div className="space-y-5">
              <section id="notifications-channels" className="scroll-mt-28">
                <Card
                  title="Notification Channels"
                  eyebrow="Delivery"
                  description="Choose where alerts arrive when an event is emitted."
                  className="rounded-[24px]"
                >
                  <div className="grid gap-3">
                    {NOTIFICATION_CHANNEL_OPTIONS.map((channel) => (
                      <Toggle
                        key={channel.key}
                        label={channel.label}
                        description={channel.description}
                        checked={notificationDraft.channels[channel.key]}
                        disabled={channel.disabled}
                        onCheckedChange={(value) =>
                          setNotificationDraft((previous) =>
                            previous
                              ? {
                                  ...previous,
                                  channels: { ...previous.channels, [channel.key]: value },
                                }
                              : previous,
                          )
                        }
                      />
                    ))}
                  </div>
                </Card>
              </section>

              <section id="notifications-events" className="scroll-mt-28">
                <Card
                  title="Alert Events"
                  eyebrow="Preferences"
                  description="Control which platform events trigger emails or chat notifications."
                  className="rounded-[24px]"
                >
                  <div className="grid gap-3 lg:grid-cols-2">
                    {NOTIFICATION_EVENT_OPTIONS.map((eventOption) => (
                      <Toggle
                        key={eventOption.key}
                        label={eventOption.label}
                        description={eventOption.description}
                        checked={notificationDraft.events[eventOption.key]}
                        disabled={eventOption.disabled}
                        onCheckedChange={(value) =>
                          setNotificationDraft((previous) =>
                            previous
                              ? {
                                  ...previous,
                                  events: { ...previous.events, [eventOption.key]: value },
                                }
                              : previous,
                          )
                        }
                      />
                    ))}
                  </div>
                  <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/60">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {notificationsDirty
                        ? 'Unsaved notification changes'
                        : 'Notification preferences are in sync'}
                    </p>
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
              </section>
            </div>
          ) : null}

          {activeTab === 'trading' ? (
            <div className="space-y-5">
              <section id="trading-mode" className="scroll-mt-28">
                <Card
                  title="Execution Mode"
                  eyebrow="Safety"
                  description="Control how TradePilot handles validated signals."
                  className="rounded-[24px]"
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
                          className={cn(
                            'rounded-2xl border px-4 py-4 text-left transition-colors',
                            selected
                              ? 'border-blue-500 bg-blue-50 dark:border-blue-500 dark:bg-blue-500/10'
                              : 'border-gray-200 bg-white hover:border-gray-300 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600',
                          )}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                              {option.title}
                            </p>
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
              </section>

              <section id="trading-risk" className="scroll-mt-28">
                <Card
                  title="Risk Controls"
                  eyebrow="Limits"
                  description="Hard caps that can block or pause execution before risk compounds."
                  className="rounded-[24px]"
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
                            ? {
                                ...previous,
                                maxDailyLossPercent: Number(event.target.value) || 1,
                              }
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
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-300">
                      {settingsDraft.executionPaused ? (
                        <span>
                          Execution paused by failsafe: {settingsDraft.executionPauseReason ?? 'UNKNOWN'}
                        </span>
                      ) : (
                        <span>Execution is active and ready for validated signals.</span>
                      )}
                    </div>
                  </div>
                </Card>
              </section>

              <section id="trading-symbols" className="scroll-mt-28">
                <Card
                  title="Excluded Symbols"
                  eyebrow="Allowlist Override"
                  description="All symbols are tradable by default. Add only the symbols that must be blocked."
                  className="rounded-[24px]"
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
                      <span className="text-sm text-slate-500 dark:text-slate-400">
                        No excluded symbols.
                      </span>
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
              </section>

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
            <section id="billing-overview" className="scroll-mt-28">
              <Card
                title="Billing"
                eyebrow="Coming soon"
                description="Subscription management endpoints are prepared for the next launch milestone."
                className="rounded-[24px]"
              >
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                  Billing automation, invoices, and plan changes will be enabled in this tab in a
                  future release.
                </div>
              </Card>
            </section>
          ) : null}

          {authUser?.pendingEmail ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
              Pending email change: {authUser.pendingEmail}. Verify the token to finalize the
              update.
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}
