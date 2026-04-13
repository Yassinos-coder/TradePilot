import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Activity, AlertCircle, Loader2 } from 'lucide-react';

import { Button } from '../components/ui/Button';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/auth-store';

const CALLBACK_TIMEOUT_MS = 5000;

function getCallbackError(searchParams: URLSearchParams) {
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  return (
    hashParams.get('error_description') ??
    hashParams.get('error') ??
    searchParams.get('error_description') ??
    searchParams.get('error')
  );
}

export function AuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const callbackError = useMemo(() => getCallbackError(searchParams), [searchParams]);
  const [asyncError, setAsyncError] = useState<string | null>(null);

  const redirectTo = useMemo(() => {
    const next = searchParams.get('next');
    return next?.startsWith('/') ? next : '/';
  }, [searchParams]);

  const error = callbackError ?? asyncError;

  useEffect(() => {
    if (isAuthenticated && !error) navigate(redirectTo, { replace: true });
  }, [error, isAuthenticated, navigate, redirectTo]);

  useEffect(() => {
    if (error) return;

    let active = true;
    let timeoutId: number | undefined;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active || !session) return;
      navigate(redirectTo, { replace: true });
    });

    const settle = async () => {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (!active) return;
      if (sessionError) { setAsyncError(sessionError.message); return; }
      if (session) { navigate(redirectTo, { replace: true }); return; }

      timeoutId = window.setTimeout(async () => {
        const { data: { session: retry } } = await supabase.auth.getSession();
        if (!active) return;
        if (retry) { navigate(redirectTo, { replace: true }); return; }
        setAsyncError('Sign-in could not be completed. Please request a new magic link.');
      }, CALLBACK_TIMEOUT_MS);
    };

    void settle();
    return () => {
      active = false;
      subscription.unsubscribe();
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [error, navigate, redirectTo]);

  if (isAuthenticated && !error) return <Navigate to={redirectTo} replace />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-slate-950 p-6">
      <div className="w-full max-w-sm space-y-6 text-center">
        {/* Logo */}
        <div className="flex justify-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600">
            <Activity className="h-5 w-5 text-white" />
          </div>
        </div>

        {/* Status icon */}
        <div className="flex justify-center">
          <div className={[
            'flex h-14 w-14 items-center justify-center rounded-full border',
            error
              ? 'border-red-200 bg-red-50 dark:border-red-500/20 dark:bg-red-500/10'
              : 'border-blue-200 bg-blue-50 dark:border-blue-500/20 dark:bg-blue-500/10',
          ].join(' ')}>
            {error ? (
              <AlertCircle className="h-6 w-6 text-red-500 dark:text-red-400" />
            ) : (
              <Loader2 className="h-6 w-6 animate-spin text-blue-600 dark:text-blue-400" />
            )}
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
            {error ? 'Sign-in failed' : 'Completing sign-in…'}
          </h1>
          <p className="text-sm text-gray-500 dark:text-slate-400">
            {error ?? 'Verifying your magic link and loading your workspace.'}
          </p>
        </div>

        {error && (
          <Button variant="secondary" onClick={() => navigate('/auth', { replace: true })}>
            Back to sign in
          </Button>
        )}
      </div>
    </div>
  );
}
