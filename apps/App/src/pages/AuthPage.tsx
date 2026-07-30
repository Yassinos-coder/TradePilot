import { FormEvent, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Activity, Apple, ArrowRight, Chrome, Radio, Shield, Zap } from 'lucide-react';

import { useAuthStore } from '../store/auth-store';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

type AuthMode = 'magic' | 'password';

const FEATURES = [
  { icon: Zap, text: 'Master to slave copying over a live MT4/MT5 bridge' },
  { icon: Radio, text: 'Per-account risk sizing with broker symbol remapping' },
  { icon: Shield, text: 'Supabase auth with Google, Apple, and magic link access' },
];

export function AuthPage() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const error = useAuthStore((s) => s.error);
  const magicLinkSent = useAuthStore((s) => s.magicLinkSent);
  const login = useAuthStore((s) => s.login);
  const loginWithOAuth = useAuthStore((s) => s.loginWithOAuth);
  const sendMagicLink = useAuthStore((s) => s.sendMagicLink);
  const clearError = useAuthStore((s) => s.clearError);
  const clearMagicLinkSent = useAuthStore((s) => s.clearMagicLinkSent);

  const [mode, setMode] = useState<AuthMode>('magic');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    clearError();
    clearMagicLinkSent();
  }, [mode, clearError, clearMagicLinkSent]);

  if (isAuthenticated) {
    return <Navigate to="/app" replace />;
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    try {
      if (mode === 'magic') {
        await sendMagicLink(email);
      } else {
        await login(email, password);
      }
    } catch {
      // Error state is already handled in the store.
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.14),_transparent_38%),linear-gradient(180deg,#f6fbff_0%,#eef6ff_44%,#f8fafc_100%)]">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col lg:flex-row">
        <motion.aside
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35 }}
          className="flex flex-col justify-between border-b border-brand-subtle px-6 py-8 lg:w-[520px] lg:border-b-0 lg:border-r lg:border-line lg:px-10 lg:py-10"
        >
          <div className="space-y-10">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand shadow-[0_16px_36px_-18px_rgba(2,132,199,0.85)]">
                <Activity className="h-5 w-5 text-content-inverse" />
              </div>
              <div>
                <p className="text-sm font-semibold tracking-wide text-content-primary">
                  TradePilot
                </p>
                <p className="text-xs text-content-tertiary">
                  Production-grade signal execution
                </p>
              </div>
            </div>

            <div className="space-y-5">
              <p className="text-xs font-semibold uppercase tracking-[0.32em] text-brand">
                Master to slave copying
              </p>
              <h1 className="max-w-md text-3xl font-semibold tracking-tight text-content-primary sm:text-4xl">
                Mirror one account across many, with the risk on each one under your control.
              </h1>
              <p className="max-w-md text-sm leading-6 text-content-secondary">
                TradePilot watches your master terminal, sizes each copy to the limits you set per
                slave account, and maps broker symbols automatically through the EA gateway.
              </p>
            </div>

            <div className="space-y-3">
              {FEATURES.map(({ icon: Icon, text }) => (
                <div
                  key={text}
                  className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 shadow-sm backdrop-blur"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-subtle text-brand">
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className="text-sm text-content-secondary">{text}</span>
                </div>
              ))}
            </div>
          </div>

          <p className="mt-10 text-xs text-content-tertiary">
            Secure access is handled by Supabase. Your broker credentials stay in MetaTrader.
          </p>
        </motion.aside>

        <div className="flex flex-1 items-center justify-center px-6 py-10 lg:px-10">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.08 }}
            className="w-full max-w-md rounded-[28px] border border-line bg-surface p-6 shadow-[0_24px_80px_-36px_rgba(15,23,42,0.35)] backdrop-blur md:p-8"
          >
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold tracking-tight text-content-primary">
                Sign in
              </h2>
              <p className="text-sm text-content-tertiary">
                Use OAuth for the fastest setup, or send yourself a passwordless magic link.
              </p>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <Button
                variant="secondary"
                onClick={() => void loginWithOAuth('google')}
                isLoading={isLoading}
                className="justify-center"
              >
                <Chrome className="h-4 w-4" />
                Google
              </Button>
              <Button
                variant="secondary"
                onClick={() => void loginWithOAuth('apple')}
                isLoading={isLoading}
                className="justify-center"
              >
                <Apple className="h-4 w-4" />
                Apple
              </Button>
            </div>

            <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-[0.22em] text-content-tertiary">
              <span className="h-px flex-1 bg-line" />
              Or continue with email
              <span className="h-px flex-1 bg-line" />
            </div>

            <div className="flex rounded-2xl border border-line bg-surface-muted p-1">
              {(['magic', 'password'] as AuthMode[]).map((candidate) => (
                <button
                  key={candidate}
                  type="button"
                  onClick={() => setMode(candidate)}
                  className={[
                    'flex-1 rounded-2xl px-3 py-2 text-xs font-semibold transition-colors',
                    mode === candidate
                      ? 'bg-surface text-content-primary shadow-sm'
                      : 'text-content-tertiary',
                  ].join(' ')}
                >
                  {candidate === 'magic' ? 'Magic link' : 'Password'}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <Input
                label="Email address"
                type="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  clearError();
                }}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />

              {mode === 'password' ? (
                <Input
                  label="Password"
                  type="password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    clearError();
                  }}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  required
                />
              ) : null}

              {magicLinkSent ? (
                <div className="rounded-2xl border border-brand/30 bg-brand-subtle px-4 py-3 text-sm text-brand">
                  Magic link sent to <strong>{email}</strong>. Check your inbox to finish sign-in.
                </div>
              ) : null}

              {error ? (
                <div className="rounded-2xl border border-negative bg-negative-subtle px-4 py-3 text-sm text-negative">
                  {error}
                </div>
              ) : null}

              <Button type="submit" className="w-full justify-center" isLoading={isLoading} size="lg">
                {mode === 'magic' ? 'Send magic link' : 'Sign in with password'}
                {!isLoading ? <ArrowRight className="h-4 w-4" /> : null}
              </Button>
            </form>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
