import { UserDTO } from '@tradepilot/shared';
import { Session } from '@supabase/supabase-js';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

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
  logout: () => Promise<void>;
  updateUser: (user: UserDTO) => void;
  clearError: () => void;
  clearMagicLinkSent: () => void;
}

let authListenerAttached = false;

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
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

          set((state) => ({
            ...state,
            isAuthenticated: Boolean(session),
            session,
            isLoading: false,
            error: null,
          }));

          if (!authListenerAttached) {
            authListenerAttached = true;

            supabase.auth.onAuthStateChange((_event, session) => {
              set((state) => ({
                ...state,
                isAuthenticated: Boolean(session),
                session,
                isLoading: false,
                user: session ? state.user : null,
                magicLinkSent: session ? false : state.magicLinkSent,
              }));
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
          callbackUrl.searchParams.set('next', '/');

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
      logout: async () => {
        try {
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
    }),
    {
      name: 'tradepilot-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        isAuthenticated: state.isAuthenticated,
        user: state.user,
      }),
    },
  ),
);
