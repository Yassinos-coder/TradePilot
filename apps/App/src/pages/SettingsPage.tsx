import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';

import type {
  CopierRiskParams,
  NotificationPreferencesDTO,
  SettingsDTO,
  UpdateProfileInput,
} from '@tradepilot/shared';

import { RiskParamsForm } from '@/components/copier/RiskParamsForm';
import { ApiKeysPanel } from '@/components/settings/ApiKeysPanel';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { FieldGrid, Section } from '@/components/ui/Section';
import { Input } from '@/components/ui/Input';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Skeleton } from '@/components/ui/Skeleton';
import { Tabs } from '@/components/ui/Tabs';
import { Toggle } from '@/components/ui/Toggle';
import { apiClient } from '@/lib/api';
import { queryClient } from '@/lib/query-client';
import { formatTimestamp } from '@/lib/utils';
import { useAuthStore } from '@/store/auth-store';
import { useToastStore } from '@/store/toast-store';

type SettingsTab = 'account' | 'security' | 'keys' | 'copier' | 'notifications';
type AccountSection = 'info' | 'contact';

const TABS = [
  { key: 'account' as const, label: 'My Account' },
  { key: 'security' as const, label: 'Security & Sign-in' },
  { key: 'keys' as const, label: 'API & Keys' },
  { key: 'copier' as const, label: 'Copier Defaults' },
  { key: 'notifications' as const, label: 'Notifications' },
];

const TAB_KEYS = TABS.map((tab) => tab.key);

const NOTIFICATION_CHANNELS: Array<{
  key: keyof NotificationPreferencesDTO['channels'];
  label: string;
  description: string;
  disabled?: boolean;
}> = [
  {
    key: 'email',
    label: 'Email',
    description: 'Execution, protection and connectivity alerts in your inbox.',
  },
  {
    key: 'whatsapp',
    label: 'WhatsApp',
    description: 'Reserved for the next notification channel rollout.',
    disabled: true,
  },
];

const NOTIFICATION_EVENTS: Array<{
  key: keyof NotificationPreferencesDTO['events'];
  label: string;
  description: string;
  disabled?: boolean;
}> = [
  {
    key: 'newTradeOpened',
    label: 'New trade opened',
    description: 'A position was opened on one of your accounts.',
  },
  { key: 'tpHit', label: 'Take profit hit', description: 'A position closed at its take profit.' },
  { key: 'slHit', label: 'Stop loss hit', description: 'A position closed at its stop loss.' },
  {
    key: 'copyFailed',
    label: 'Copy failed',
    description: 'A slave account rejected or failed to mirror a master trade.',
  },
  {
    key: 'masterOffline',
    label: 'Master offline',
    description: 'The master terminal disconnected, so nothing can be copied.',
  },
  {
    key: 'eaDisconnected',
    label: 'EA disconnected',
    description: 'No authenticated MetaTrader connection remains online.',
  },
  {
    key: 'lowMargin',
    label: 'Low margin',
    description: 'Free margin dropped near your safety threshold.',
  },
  {
    key: 'executionFailed',
    label: 'Execution failed',
    description: 'Symbol mapping issues, dispatch failures and command errors.',
  },
  {
    key: 'dailySummary',
    label: 'Daily summary',
    description: 'Reserved for a scheduled recap digest.',
    disabled: true,
  },
];

function SettingsSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-[420px] w-full" />
    </div>
  );
}

export function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const pushToast = useToastStore((state) => state.push);
  const authUser = useAuthStore((state) => state.user);
  const updateAuthUser = useAuthStore((state) => state.updateUser);

  const [activeTab, setActiveTab] = useState<SettingsTab>('account');
  const [accountSection, setAccountSection] = useState<AccountSection>('info');

  const settingsQuery = useQuery({ queryKey: ['settings'], queryFn: apiClient.settings });
  const profileQuery = useQuery({ queryKey: ['profile'], queryFn: apiClient.profile });
  const notificationsQuery = useQuery({
    queryKey: ['notifications', 'preferences'],
    queryFn: apiClient.notificationPreferences,
  });
  const sessionsQuery = useQuery({
    queryKey: ['security', 'sessions'],
    queryFn: apiClient.sessions,
  });

  const [profileDraft, setProfileDraft] = useState<{
    fullName: string;
    nickname: string;
    phoneNumber: string;
    country: string;
    city: string;
    street: string;
    postalCode: string;
  } | null>(null);
  const [copierDefaults, setCopierDefaults] = useState<CopierRiskParams | null>(null);
  const [notificationDraft, setNotificationDraft] = useState<NotificationPreferencesDTO | null>(
    null,
  );
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

    if (tab && (TAB_KEYS as string[]).includes(tab)) {
      setActiveTab(tab as SettingsTab);
    }

    if (token) {
      setEmailToken(token);
      setActiveTab('account');
    }
  }, [searchParams]);

  useEffect(() => {
    if (profileQuery.data && !profileDraft) {
      setProfileDraft({
        fullName: profileQuery.data.fullName ?? '',
        nickname: profileQuery.data.nickname ?? '',
        phoneNumber: profileQuery.data.phoneNumber ?? '',
        country: profileQuery.data.country ?? '',
        city: profileQuery.data.city ?? '',
        street: profileQuery.data.street ?? '',
        postalCode: profileQuery.data.postalCode ?? '',
      });
      setRequestedEmail(profileQuery.data.pendingEmail ?? profileQuery.data.email);
    }
  }, [profileQuery.data, profileDraft]);

  useEffect(() => {
    if (settingsQuery.data && !copierDefaults) {
      setCopierDefaults(settingsQuery.data.copierDefaults);
    }
  }, [settingsQuery.data, copierDefaults]);

  useEffect(() => {
    if (notificationsQuery.data && !notificationDraft) {
      setNotificationDraft(notificationsQuery.data);
    }
  }, [notificationsQuery.data, notificationDraft]);

  const profileMutation = useMutation({
    mutationFn: (payload: UpdateProfileInput) => apiClient.updateProfile(payload),
    onSuccess: (data) => {
      queryClient.setQueryData(['profile'], data);
      updateAuthUser(data);
      pushToast({ tone: 'success', title: 'Profile updated' });
    },
    onError: () => pushToast({ tone: 'error', title: 'Profile update failed' }),
  });

  const settingsMutation = useMutation({
    mutationFn: (payload: SettingsDTO) => apiClient.updateSettings(payload),
    onSuccess: (data) => {
      queryClient.setQueryData(['settings'], data);
      setCopierDefaults(data.copierDefaults);
      pushToast({ tone: 'success', title: 'Copier defaults saved' });
    },
    onError: () => pushToast({ tone: 'error', title: 'Could not save copier defaults' }),
  });

  const requestEmailChangeMutation = useMutation({
    mutationFn: apiClient.requestEmailChange,
    onSuccess: (data) => {
      queryClient.setQueryData(['profile'], data);
      updateAuthUser(data);
      pushToast({
        tone: 'success',
        title: 'Verification email sent',
        description: 'Open the link sent to your new address.',
      });
    },
    onError: () => pushToast({ tone: 'error', title: 'Email change request failed' }),
  });

  const verifyEmailMutation = useMutation({
    mutationFn: apiClient.verifyEmailChange,
    onSuccess: (data) => {
      queryClient.setQueryData(['profile'], data);
      updateAuthUser(data);
      setEmailToken('');
      pushToast({ tone: 'success', title: 'Email address updated' });
    },
    onError: () => pushToast({ tone: 'error', title: 'Email verification failed' }),
  });

  const changePasswordMutation = useMutation({
    mutationFn: apiClient.changePassword,
    onSuccess: () => {
      setPasswordDraft({ currentPassword: '', newPassword: '', confirmNewPassword: '' });
      pushToast({ tone: 'success', title: 'Password updated' });
    },
    onError: () =>
      pushToast({
        tone: 'error',
        title: 'Password update failed',
        description: 'Check your current password and try again.',
      }),
  });

  const logoutAllMutation = useMutation({
    mutationFn: apiClient.logoutAllSessions,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['security', 'sessions'] });
      pushToast({ tone: 'success', title: 'All sessions revoked' });
    },
    onError: () => pushToast({ tone: 'error', title: 'Could not revoke sessions' }),
  });

  const notificationMutation = useMutation({
    mutationFn: apiClient.updateNotificationPreferences,
    onSuccess: (data) => {
      setNotificationDraft(data);
      queryClient.setQueryData(['notifications', 'preferences'], data);
      pushToast({ tone: 'success', title: 'Notification preferences saved' });
    },
    onError: () => pushToast({ tone: 'error', title: 'Notification update failed' }),
  });

  const notificationsDirty = useMemo(
    () =>
      Boolean(
        notificationDraft &&
          notificationsQuery.data &&
          JSON.stringify(notificationDraft) !== JSON.stringify(notificationsQuery.data),
      ),
    [notificationDraft, notificationsQuery.data],
  );

  const copierDefaultsDirty = useMemo(
    () =>
      Boolean(
        copierDefaults &&
          settingsQuery.data &&
          JSON.stringify(copierDefaults) !== JSON.stringify(settingsQuery.data.copierDefaults),
      ),
    [copierDefaults, settingsQuery.data],
  );

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
    !profileDraft ||
    !copierDefaults ||
    !notificationDraft ||
    !settingsQuery.data
  ) {
    return <SettingsSkeleton />;
  }

  const settings = settingsQuery.data;
  const email = profileQuery.data?.email ?? authUser?.email ?? '';
  const displayName = profileDraft.nickname || profileDraft.fullName || email;
  const initials = (profileDraft.fullName || email).slice(0, 2).toUpperCase();

  return (
    <div className="space-y-6">
      {/* Hero band */}
      <section className="border-line -mx-4 border-b px-4 pb-0 sm:-mx-6 sm:px-6">
        <div className="mb-5 flex items-center gap-3">
          <div className="bg-surface-muted text-content-secondary flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-lg font-semibold">
            {initials}
          </div>
          <div className="min-w-0">
            <h1 className="text-content-primary truncate text-2xl font-semibold tracking-tight">
              {displayName}
            </h1>
            <p className="text-content-tertiary truncate text-xs">{email}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <Badge tone={settings.executionPaused ? 'warning' : 'positive'} dot>
                {settings.executionPaused ? 'Copier paused' : 'Copier active'}
              </Badge>
              {settings.allowApiTradeOpening ? <Badge tone="info">API trading on</Badge> : null}
              {profileQuery.data?.pendingEmail ? (
                <Badge tone="warning">Pending email change</Badge>
              ) : null}
            </div>
          </div>
        </div>

        <Tabs items={TABS} value={activeTab} onChange={selectTab} />
      </section>

      {/* ── My Account ── */}
      {activeTab === 'account' ? (
        <div className="flex flex-col gap-6">
          <div className="border-line bg-surface rounded-card border p-2">
            <SegmentedControl
              items={[
                { key: 'info' as const, label: 'Account Info' },
                { key: 'contact' as const, label: 'Address & Contact' },
              ]}
              value={accountSection}
              onChange={setAccountSection}
            />
          </div>

          {accountSection === 'info' ? (
            <Section
              title="Personal Information"
              description="The account owner details used across the platform."
              footer={
                <Button
                  fullWidth
                  onClick={() =>
                    profileMutation.mutate({
                      fullName: profileDraft.fullName || null,
                      nickname: profileDraft.nickname || null,
                      phoneNumber: profileDraft.phoneNumber || null,
                    })
                  }
                  isLoading={profileMutation.isPending}
                >
                  Save
                </Button>
              }
            >
              <FieldGrid>
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
                  label="Nickname"
                  value={profileDraft.nickname}
                  onChange={(event) =>
                    setProfileDraft((previous) =>
                      previous ? { ...previous, nickname: event.target.value } : previous,
                    )
                  }
                  placeholder="How you'd like to be addressed"
                />
              </FieldGrid>
            </Section>
          ) : (
            <>
              <Section
                title="Address & Contact"
                description="Used for billing records and account correspondence."
                footer={
                  <Button
                    fullWidth
                    onClick={() =>
                      profileMutation.mutate({
                        fullName: profileDraft.fullName || null,
                        phoneNumber: profileDraft.phoneNumber || null,
                        country: profileDraft.country || null,
                        city: profileDraft.city || null,
                        street: profileDraft.street || null,
                        postalCode: profileDraft.postalCode || null,
                      })
                    }
                    isLoading={profileMutation.isPending}
                  >
                    Save
                  </Button>
                }
              >
                <FieldGrid>
                  <Input
                    label="Contact phone"
                    value={profileDraft.phoneNumber}
                    onChange={(event) =>
                      setProfileDraft((previous) =>
                        previous ? { ...previous, phoneNumber: event.target.value } : previous,
                      )
                    }
                    placeholder="+15551234567"
                  />
                  <Input label="E-mail address" value={email} onChange={() => undefined} disabled />
                  <Input
                    label="Country"
                    value={profileDraft.country}
                    onChange={(event) =>
                      setProfileDraft((previous) =>
                        previous
                          ? { ...previous, country: event.target.value.toUpperCase().slice(0, 2) }
                          : previous,
                      )
                    }
                    placeholder="MA"
                    hint="Two-letter country code"
                  />
                  <Input
                    label="City"
                    value={profileDraft.city}
                    onChange={(event) =>
                      setProfileDraft((previous) =>
                        previous ? { ...previous, city: event.target.value } : previous,
                      )
                    }
                  />
                  <Input
                    label="Street"
                    value={profileDraft.street}
                    onChange={(event) =>
                      setProfileDraft((previous) =>
                        previous ? { ...previous, street: event.target.value } : previous,
                      )
                    }
                  />
                  <Input
                    label="Postal code"
                    value={profileDraft.postalCode}
                    onChange={(event) =>
                      setProfileDraft((previous) =>
                        previous ? { ...previous, postalCode: event.target.value } : previous,
                      )
                    }
                  />
                </FieldGrid>
              </Section>

              <Section
                title="Email address"
                description="Changing your email needs verification on the new address."
              >
                <FieldGrid>
                  <Input
                    type="email"
                    label="New email address"
                    value={requestedEmail}
                    onChange={(event) => setRequestedEmail(event.target.value)}
                    placeholder="new@email.com"
                  />
                  <Input
                    label="Verification token"
                    value={emailToken}
                    onChange={(event) => setEmailToken(event.target.value)}
                    placeholder="Paste the token if the link didn't work"
                  />
                </FieldGrid>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={() =>
                      requestEmailChangeMutation.mutate({ newEmail: requestedEmail })
                    }
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
                    Verify token
                  </Button>
                </div>
              </Section>
            </>
          )}
        </div>
      ) : null}

      {/* ── Security ── */}
      {activeTab === 'security' ? (
        <div className="flex flex-col gap-6">
          <Section title="Password" description="Rotate your password after confirming the current one.">
            <form
              onSubmit={(event: FormEvent) => {
                event.preventDefault();
                if (passwordDraft.newPassword !== passwordDraft.confirmNewPassword) {
                  pushToast({
                    tone: 'error',
                    title: 'Passwords do not match',
                    description: 'The new password and its confirmation must be identical.',
                  });
                  return;
                }
                changePasswordMutation.mutate({
                  currentPassword: passwordDraft.currentPassword,
                  newPassword: passwordDraft.newPassword,
                });
              }}
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
              </div>
              <div className="mt-5">
                <Button type="submit" fullWidth isLoading={changePasswordMutation.isPending}>
                  Update password
                </Button>
              </div>
            </form>
          </Section>

          <Section
            title="Active sessions"
            description="Where your account is signed in right now."
            footer={
              <Button
                variant="danger"
                fullWidth
                onClick={() => logoutAllMutation.mutate()}
                isLoading={logoutAllMutation.isPending}
              >
                Sign out everywhere
              </Button>
            }
          >
            <div className="space-y-2.5">
              {(sessionsQuery.data ?? []).length === 0 ? (
                <p className="text-content-tertiary text-sm">No active sessions recorded.</p>
              ) : (
                (sessionsQuery.data ?? []).map((session) => (
                  <div
                    key={session.id}
                    className="border-line-subtle bg-surface-inset rounded-lg border px-4 py-3"
                  >
                    <p className="text-content-primary text-sm font-medium">
                      {session.userAgent ?? 'Unknown device'}
                    </p>
                    <p className="text-content-tertiary text-xs">
                      {session.ipAddress ?? 'Unknown IP'} · last seen{' '}
                      {formatTimestamp(session.lastSeenAt)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </Section>
        </div>
      ) : null}

      {/* ── API & Keys ── */}
      {activeTab === 'keys' ? (
        <ApiKeysPanel allowApiTradeOpening={settings.allowApiTradeOpening} />
      ) : null}

      {/* ── Copier Defaults ── */}
      {activeTab === 'copier' ? (
        <Section
          title="Default risk parameters"
          description="Prefilled into every new slave link. Changing them does not affect links that already exist."
          footer={
            <div className="flex items-center justify-between gap-3">
              <span className="text-content-tertiary text-xs">
                {copierDefaultsDirty ? 'Unsaved changes' : 'Defaults are in sync'}
              </span>
              <Button
                onClick={() => settingsMutation.mutate({ ...settings, copierDefaults })}
                isLoading={settingsMutation.isPending}
                disabled={!copierDefaultsDirty}
              >
                Save defaults
              </Button>
            </div>
          }
        >
          <RiskParamsForm value={copierDefaults} onChange={setCopierDefaults} />
        </Section>
      ) : null}

      {/* ── Notifications ── */}
      {activeTab === 'notifications' ? (
        <div className="flex flex-col gap-6">
          <Section title="Channels" description="Where alerts are delivered.">
            <div className="grid gap-2.5">
              {NOTIFICATION_CHANNELS.map((channel) => (
                <Toggle
                  key={channel.key}
                  label={channel.label}
                  description={channel.description}
                  disabled={channel.disabled}
                  checked={notificationDraft.channels[channel.key]}
                  onCheckedChange={(next) =>
                    setNotificationDraft((previous) =>
                      previous
                        ? { ...previous, channels: { ...previous.channels, [channel.key]: next } }
                        : previous,
                    )
                  }
                />
              ))}
            </div>
          </Section>

          <Section
            title="Alert events"
            description="Which platform events are worth interrupting you for."
            footer={
              <div className="flex items-center justify-between gap-3">
                <span className="text-content-tertiary text-xs">
                  {notificationsDirty ? 'Unsaved changes' : 'Preferences are in sync'}
                </span>
                <Button
                  onClick={() => notificationMutation.mutate(notificationDraft)}
                  isLoading={notificationMutation.isPending}
                  disabled={!notificationsDirty}
                >
                  Save notifications
                </Button>
              </div>
            }
          >
            <div className="grid gap-2.5 lg:grid-cols-2">
              {NOTIFICATION_EVENTS.map((event) => (
                <Toggle
                  key={event.key}
                  label={event.label}
                  description={event.description}
                  disabled={event.disabled}
                  checked={notificationDraft.events[event.key]}
                  onCheckedChange={(next) =>
                    setNotificationDraft((previous) =>
                      previous
                        ? { ...previous, events: { ...previous.events, [event.key]: next } }
                        : previous,
                    )
                  }
                />
              ))}
            </div>
          </Section>
        </div>
      ) : null}

      {profileQuery.data?.pendingEmail ? (
        <Alert tone="warning" title="Pending email change">
          {profileQuery.data.pendingEmail} — verify the token to finalise the update.
        </Alert>
      ) : null}
    </div>
  );
}
