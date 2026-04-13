import { FormEvent, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Activity, ArrowRight, Zap, Shield, Radio } from 'lucide-react';

import { useAuthStore } from '../store/auth-store';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

type AuthMode = 'magic' | 'password';

const FEATURES = [
  { icon: Zap, text: 'Real-time signal execution via WebSocket' },
  { icon: Shield, text: 'Supabase Auth with magic-link access' },
  { icon: Radio, text: 'Live EA gateway with heartbeat monitoring' },
];

export function AuthPage() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const error = useAuthStore((s) => s.error);
  const magicLinkSent = useAuthStore((s) => s.magicLinkSent);
  const login = useAuthStore((s) => s.login);
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

  if (isAuthenticated) return <Navigate to="/" replace />;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      if (mode === 'magic') {
        await sendMagicLink(email);
      } else {
        await login(email, password);
      }
    } catch {
      // error is stored in auth state
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      {/* Left panel */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4 }}
        className="hidden lg:flex lg:w-[480px] flex-col justify-between bg-slate-900 dark:bg-slate-900 border-r border-slate-800 p-10"
      >
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600">
            <Activity className="h-5 w-5 text-white" />
          </div>
          <span className="text-base font-semibold text-white">TradePilot</span>
        </div>

        {/* Hero text */}
        <div className="space-y-6">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-blue-400">
              Automated signal execution
            </p>
            <h1 className="text-3xl font-bold leading-tight text-white">
              From Telegram to MetaTrader
              <br />
              in milliseconds.
            </h1>
            <p className="text-sm leading-relaxed text-slate-400">
              Connect your EA with a single API key. TradePilot parses, validates, and routes
              trading signals with zero manual intervention.
            </p>
          </div>

          <div className="space-y-3">
            {FEATURES.map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-600/20">
                  <Icon className="h-3.5 w-3.5 text-blue-400" />
                </div>
                <span className="text-sm text-slate-300">{text}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-slate-600">© 2025 TradePilot</p>
      </motion.div>

      {/* Right panel — form */}
      <div className="flex flex-1 items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.1 }}
          className="w-full max-w-sm space-y-6"
        >
          {/* Mobile logo */}
          <div className="flex items-center gap-2 lg:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
              <Activity className="h-4 w-4 text-white" />
            </div>
            <span className="text-sm font-semibold text-gray-900 dark:text-white">TradePilot</span>
          </div>

          <div className="space-y-1">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Sign in</h2>
            <p className="text-sm text-gray-500 dark:text-slate-400">
              {mode === 'magic'
                ? 'Enter your email to receive a magic link.'
                : 'Sign in with your Supabase password.'}
            </p>
          </div>

          {/* Mode switcher */}
          <div className="flex rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-100 dark:bg-slate-800 p-1">
            {(['magic', 'password'] as AuthMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={[
                  'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  mode === m
                    ? 'bg-white dark:bg-slate-700 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200',
                ].join(' ')}
              >
                {m === 'magic' ? 'Magic link' : 'Password'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Email address"
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); clearError(); }}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />

            {mode === 'password' && (
              <Input
                label="Password"
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); clearError(); }}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
            )}

            {magicLinkSent && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-500/20 dark:bg-blue-500/10 px-4 py-3 text-sm text-blue-700 dark:text-blue-300">
                Magic link sent to <strong>{email}</strong>. Check your inbox.
              </div>
            )}

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-500/20 dark:bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" isLoading={isLoading} size="lg">
              {mode === 'magic' ? 'Send magic link' : 'Sign in'}
              {!isLoading && <ArrowRight className="ml-1 h-4 w-4" />}
            </Button>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
