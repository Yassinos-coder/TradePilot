import { FormEvent, useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Apple, ArrowRight, Chrome, Download } from 'lucide-react';

import { AuthShowcase } from '@/components/auth/AuthShowcase';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { TradePilotLogo } from '@/components/brand/TradePilotLogo';
import { useAuthStore } from '@/store/auth-store';

type AuthMode = 'magic' | 'password';

const EA_DOWNLOAD_URL = '/downloads/TradePilot_EA_MT5.ex5';

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
        return;
      }

      await login(email, password);
    } catch {
      // Error state is already handled in the store.
    }
  };

  return (
    <div className="bg-canvas relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_6%,var(--color-brand-subtle),transparent_45%)]" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-[1360px] flex-col px-6 py-7 sm:px-10">
        <header className="flex items-center justify-between">
          <Link to="/" aria-label="TradePilot home">
            <TradePilotLogo compact showTagline={false} />
          </Link>
          <Link
            to="/pricing"
            className="text-content-secondary hover:bg-surface-muted hover:text-content-primary rounded-xl px-3 py-2 text-sm font-medium transition-colors"
          >
            Pricing
          </Link>
        </header>

        <main className="flex flex-1 items-center py-10">
          <div className="grid w-full items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.32 }}
              className="mx-auto w-full max-w-md"
            >
              <h1 className="text-content-primary text-center text-4xl font-semibold tracking-tight sm:text-5xl">
                Copy every trade
              </h1>
              <p className="text-content-secondary mt-3 text-center text-base">
                Your execution layer for MT4 and MT5
              </p>

              <div className="border-line bg-surface mt-8 rounded-3xl border p-5 shadow-[0_24px_70px_-40px_rgba(15,23,42,0.4)] sm:p-6">
                <div className="space-y-2.5">
                  <Button
                    variant="outline"
                    size="lg"
                    fullWidth
                    onClick={() => void loginWithOAuth('google')}
                    isLoading={isLoading}
                  >
                    <Chrome className="h-4 w-4" />
                    Continue with Google
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    fullWidth
                    onClick={() => void loginWithOAuth('apple')}
                    isLoading={isLoading}
                  >
                    <Apple className="h-4 w-4" />
                    Continue with Apple
                  </Button>
                </div>

                <div className="text-content-tertiary my-5 flex items-center gap-3 text-[11px] font-medium tracking-[0.18em] uppercase">
                  <span className="bg-line h-px flex-1" />
                  Or
                  <span className="bg-line h-px flex-1" />
                </div>

                <form onSubmit={handleSubmit} className="space-y-3">
                  <Input
                    type="email"
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      clearError();
                    }}
                    placeholder="Enter your email"
                    autoComplete="email"
                    aria-label="Email address"
                    className="h-11"
                    required
                  />

                  {mode === 'password' ? (
                    <Input
                      type="password"
                      value={password}
                      onChange={(event) => {
                        setPassword(event.target.value);
                        clearError();
                      }}
                      placeholder="Enter your password"
                      autoComplete="current-password"
                      aria-label="Password"
                      className="h-11"
                      required
                    />
                  ) : null}

                  {magicLinkSent ? (
                    <div className="border-brand/30 bg-brand-subtle text-brand rounded-xl border px-4 py-3 text-sm">
                      Magic link sent to <strong>{email}</strong>. Check your inbox to finish
                      sign-in.
                    </div>
                  ) : null}

                  {error ? (
                    <div className="border-negative bg-negative-subtle text-negative rounded-xl border px-4 py-3 text-sm">
                      {error}
                    </div>
                  ) : null}

                  <Button type="submit" size="lg" fullWidth isLoading={isLoading}>
                    {mode === 'magic' ? 'Continue with email' : 'Sign in with password'}
                    {!isLoading ? <ArrowRight className="h-4 w-4" /> : null}
                  </Button>
                </form>

                <button
                  type="button"
                  onClick={() => setMode(mode === 'magic' ? 'password' : 'magic')}
                  className="text-content-secondary hover:text-content-primary mt-3 w-full cursor-pointer text-center text-xs font-medium transition-colors"
                >
                  {mode === 'magic' ? 'Use a password instead' : 'Email me a magic link instead'}
                </button>

                <p className="text-content-tertiary mt-4 text-center text-xs leading-5">
                  By continuing, you acknowledge TradePilot's{' '}
                  <Link to="/terms" className="hover:text-content-secondary underline">
                    Terms
                  </Link>{' '}
                  and{' '}
                  <Link to="/privacy" className="hover:text-content-secondary underline">
                    Privacy Policy
                  </Link>
                  .
                </p>
              </div>

              <div className="mt-6 flex justify-center">
                <a
                  href={EA_DOWNLOAD_URL}
                  download
                  className="border-line bg-surface text-content-secondary hover:bg-surface-muted hover:text-content-primary inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors"
                >
                  <Download className="h-4 w-4" />
                  Download the MetaTrader EA
                </a>
              </div>

              <p className="text-content-tertiary mt-6 text-center text-xs">
                Secure access is handled by Supabase. Your broker credentials stay in MetaTrader.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, delay: 0.1 }}
              className="hidden lg:block"
            >
              <AuthShowcase />
            </motion.div>
          </div>
        </main>
      </div>
    </div>
  );
}
