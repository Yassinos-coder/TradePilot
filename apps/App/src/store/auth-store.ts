import { UserDTO } from '@tradepilot/shared';
import { Session } from '@supabase/supabase-js';
import { create } from 'zustand';

import { apiClient } from '../lib/api';
import { clearAuthCookie, syncAuthCookie } from '../lib/auth-cookie';
import { supabase, supabaseEnv } from '../lib/supabase';

interface AuthState {
  isAuthenticated: boolean;
  session: Session | null;
  isLoading: boolean;
  error: string | null;
  magicLinkSent: boolean;
  user: UserDTO | null;
  initialize: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  sendMagicLink: (email: string) => Promise<void>;
  loginWithOAuth: (provider: 'google' | 'apple') => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (user: UserDTO) => void;
  clearError: () => void;
  clearMagicLinkSent: () => void;
}

let authListenerAttached = false;

async function getUserFromServerSession(): Promise<UserDTO | null> {
  try {
    return await apiClient.profile();
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState>()((set) => ({
  isAuthenticated: false,
  session: null,
  isLoading: true,
  error: null,
  magicLinkSent: false,
  user: null,
  initialize: async () => {
    try {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (error) {
        throw error;
      }

      await syncAuthCookie(session);

      let user: UserDTO | null = null;
      let isAuthenticated = Boolean(session);

      if (!session) {
        user = await getUserFromServerSession();
        isAuthenticated = Boolean(user);
      }

      set((state) => ({
        ...state,
        isAuthenticated,
        session,
        user: user ?? state.user,
        isLoading: false,
        error: null,
      }));

      if (!authListenerAttached) {
        authListenerAttached = true;

        supabase.auth.onAuthStateChange((_event, session) => {
          void (async () => {
            if (session) {
              await syncAuthCookie(session);
              set((state) => ({
                ...state,
                isAuthenticated: true,
                session,
                isLoading: false,
                user: state.user,
                magicLinkSent: false,
              }));
              return;
            }

            const serverUser = await getUserFromServerSession();
            set((state) => ({
              ...state,
              isAuthenticated: Boolean(serverUser),
              session: null,
              isLoading: false,
              user: serverUser,
              magicLinkSent: serverUser ? false : state.magicLinkSent,
            }));
          })();
        });
      }
    } catch (error) {
      set((state) => ({
        ...state,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to initialize auth',
      }));
    }
  },
  login: async (email, password) => {
    set((state) => ({
      ...state,
      isLoading: true,
      error: null,
      magicLinkSent: false,
    }));

    try {
      const {
        data: { session },
        error,
      } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        throw error;
      }

      set((state) => ({
        ...state,
        isAuthenticated: Boolean(session),
        session,
        isLoading: false,
        error: null,
      }));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to sign in with password';

      set((state) => ({
        ...state,
        isLoading: false,
        error: message,
      }));

      throw error;
    }
  },
  sendMagicLink: async (email) => {
    set((state) => ({
      ...state,
      isLoading: true,
      error: null,
      magicLinkSent: false,
    }));

    try {
      const callbackUrl = new URL(
        supabaseEnv.VITE_MAGIC_LINK_REDIRECT_PATH,
        window.location.origin,
      );
      callbackUrl.searchParams.set('next', '/app');

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: callbackUrl.toString(),
        },
      });

      if (error) {
        throw error;
      }

      set((state) => ({
        ...state,
        isLoading: false,
        error: null,
        magicLinkSent: true,
      }));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to send magic link';

      set((state) => ({
        ...state,
        isLoading: false,
        error: message,
      }));

      throw error;
    }
  },
  loginWithOAuth: async (provider) => {
    set((state) => ({
      ...state,
      isLoading: true,
      error: null,
      magicLinkSent: false,
    }));

    try {
      const callbackUrl = new URL('/auth/callback', window.location.origin);
      callbackUrl.searchParams.set('next', '/app');

      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: callbackUrl.toString(),
        },
      });

      if (error) {
        throw error;
      }

      set((state) => ({
        ...state,
        isLoading: false,
        error: null,
      }));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : `Failed to sign in with ${provider}`;

      set((state) => ({
        ...state,
        isLoading: false,
        error: message,
      }));

      throw error;
    }
  },
  logout: async () => {
    try {
      await clearAuthCookie();
      await supabase.auth.signOut();
    } finally {
      set({
        isAuthenticated: false,
        session: null,
        isLoading: false,
        error: null,
        magicLinkSent: false,
        user: null,
      });
    }
  },
  updateUser: (user) => set((state) => ({ ...state, user })),
  clearError: () => set((state) => ({ ...state, error: null })),
  clearMagicLinkSent: () => set((state) => ({ ...state, magicLinkSent: false })),
}));
