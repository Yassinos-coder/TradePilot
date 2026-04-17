import { FormEvent, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Activity, Apple, ArrowRight, Chrome, Radio, Shield, Zap } from 'lucide-react';

import { useAuthStore } from '../store/auth-store';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

type AuthMode = 'magic' | 'password';

const FEATURES = [
  { icon: Zap, text: 'Telegram ingestion with realtime backfill recovery' },
  { icon: Radio, text: 'Multi-account EA routing with symbol remapping' },
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
    return <Navigate to="/" replace />;
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
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.14),_transparent_38%),linear-gradient(180deg,#f6fbff_0%,#eef6ff_44%,#f8fafc_100%)] dark:bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.14),_transparent_28%),linear-gradient(180deg,#020617_0%,#071224_42%,#020617_100%)]">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col lg:flex-row">
        <motion.aside
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35 }}
          className="flex flex-col justify-between border-b border-sky-100/70 px-6 py-8 lg:w-[520px] lg:border-b-0 lg:border-r lg:border-slate-900/10 lg:px-10 lg:py-10 dark:border-slate-800"
        >
          <div className="space-y-10">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-600 shadow-[0_16px_36px_-18px_rgba(2,132,199,0.85)]">
                <Activity className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold tracking-wide text-slate-900 dark:text-white">
                  TradePilot
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Production-grade signal execution
                </p>
              </div>
            </div>

            <div className="space-y-5">
              <p className="text-xs font-semibold uppercase tracking-[0.32em] text-sky-600 dark:text-sky-400">
                Telegram to MetaTrader
              </p>
              <h1 className="max-w-md text-3xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-4xl">
                Wire your channels, accounts, and execution flow into one live control room.
              </h1>
              <p className="max-w-md text-sm leading-6 text-slate-600 dark:text-slate-300">
                TradePilot listens to Telegram in realtime, backfills missed messages, maps broker
                symbols per account, and routes lifecycle commands through the EA gateway.
              </p>
            </div>

            <div className="space-y-3">
              {FEATURES.map(({ icon: Icon, text }) => (
                <div
                  key={text}
                  className="flex items-center gap-3 rounded-2xl border border-white/70 bg-white/70 px-4 py-3 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/70"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className="text-sm text-slate-700 dark:text-slate-200">{text}</span>
                </div>
              ))}
            </div>
          </div>

          <p className="mt-10 text-xs text-slate-500 dark:text-slate-500">
            Secure access is handled by Supabase. Your broker credentials stay in MetaTrader.
          </p>
        </motion.aside>

        <div className="flex flex-1 items-center justify-center px-6 py-10 lg:px-10">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.08 }}
            className="w-full max-w-md rounded-[28px] border border-white/70 bg-white/88 p-6 shadow-[0_24px_80px_-36px_rgba(15,23,42,0.35)] backdrop-blur md:p-8 dark:border-slate-800 dark:bg-slate-900/85"
          >
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">
                Sign in
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
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

            <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">
              <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
              Or continue with email
              <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
            </div>

            <div className="flex rounded-2xl border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-950">
              {(['magic', 'password'] as AuthMode[]).map((candidate) => (
                <button
                  key={candidate}
                  type="button"
                  onClick={() => setMode(candidate)}
                  className={[
                    'flex-1 rounded-2xl px-3 py-2 text-xs font-semibold transition-colors',
                    mode === candidate
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                      : 'text-slate-500 dark:text-slate-400',
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
                <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300">
                  Magic link sent to <strong>{email}</strong>. Check your inbox to finish sign-in.
                </div>
              ) : null}

              {error ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
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
