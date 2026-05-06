import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  BarChart3,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Settings2,
  Sun,
  Wallet,
  X,
} from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';

import { useAuthStore } from '../../store/auth-store';
import { useThemeStore } from '../../store/theme-store';

const NAV = [
  { to: '/app', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/app/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/app/settings', label: 'Settings', icon: Settings2 },
  { to: '/app/accounts', label: 'Accounts', icon: Wallet },
] as const;

const PAGE_TITLES: Record<string, string> = {
  '/app': 'Dashboard',
  '/app/analytics': 'Analytics',
  '/app/settings': 'Settings',
  '/app/accounts': 'Accounts',
};

interface SidebarProps {
  onNavigate?: () => void;
}

function SidebarContent({ onNavigate }: SidebarProps) {
  const logout = useAuthStore((state) => state.logout);
  const user = useAuthStore((state) => state.user);
  const { theme, toggleTheme } = useThemeStore();
  const initials = user?.email?.slice(0, 2).toUpperCase() ?? 'TP';

  return (
    <div className="flex h-full flex-col bg-white/95 dark:bg-slate-950/96">
      <div className="flex h-16 items-center gap-3 border-b border-slate-200 px-5 dark:border-slate-800">
        <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-sky-600 shadow-[0_16px_36px_-18px_rgba(2,132,199,0.85)]">
          <Activity className="h-4 w-4 text-white" />
        </div>
        <div>
          <p className="text-sm font-semibold tracking-tight text-slate-950 dark:text-white">
            TradePilot
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Live execution workspace
          </p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/app'}
            onClick={onNavigate}
            className={({ isActive }) =>
              [
                'group flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-100',
              ].join(' ')
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  className={[
                    'h-4 w-4 shrink-0',
                    isActive
                      ? 'text-sky-600 dark:text-sky-300'
                      : 'text-slate-400 dark:text-slate-500',
                  ].join(' ')}
                />
                {label}
                {isActive ? <ChevronRight className="ml-auto h-4 w-4 opacity-60" /> : null}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-slate-200 p-3 dark:border-slate-800">
        <button
          type="button"
          onClick={toggleTheme}
          className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-100"
        >
          {theme === 'dark' ? (
            <Sun className="h-4 w-4 text-amber-500" />
          ) : (
            <Moon className="h-4 w-4 text-slate-400" />
          )}
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>

        <div className="mt-2 flex items-center gap-3 rounded-2xl border border-slate-200 px-3 py-3 dark:border-slate-800">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-600 text-xs font-semibold text-white">
            {initials}
          </div>
          <span className="min-w-0 flex-1 truncate text-xs text-slate-500 dark:text-slate-400">
            {user?.email ?? '--'}
          </span>
          <button
            type="button"
            onClick={() => void logout()}
            title="Sign out"
            className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-red-500 dark:text-slate-500 dark:hover:bg-slate-900 dark:hover:text-red-400"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function AppShell() {
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const pageTitle = PAGE_TITLES[location.pathname] ?? 'TradePilot';

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.1),_transparent_30%),linear-gradient(180deg,#f8fbff_0%,#f8fafc_100%)] dark:bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.12),_transparent_26%),linear-gradient(180deg,#020617_0%,#071224_42%,#020617_100%)]">
      <div className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:block lg:w-72 lg:border-r lg:border-slate-200/80 lg:backdrop-blur dark:lg:border-slate-800">
        <SidebarContent />
      </div>

      <AnimatePresence>
        {mobileNavOpen ? (
          <>
            <motion.button
              type="button"
              aria-label="Close navigation"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileNavOpen(false)}
              className="fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-sm lg:hidden"
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="fixed inset-y-0 left-0 z-50 w-[84vw] max-w-sm border-r border-slate-200 shadow-2xl dark:border-slate-800 lg:hidden"
            >
              <div className="absolute right-3 top-3 z-10">
                <button
                  type="button"
                  onClick={() => setMobileNavOpen(false)}
                  className="rounded-full bg-white/90 p-2 text-slate-600 shadow-sm dark:bg-slate-900/90 dark:text-slate-300"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <SidebarContent onNavigate={() => setMobileNavOpen(false)} />
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>

      <div className="flex min-h-screen flex-col lg:pl-72">
        <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/85 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 text-slate-600 dark:border-slate-800 dark:text-slate-300 lg:hidden"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.26em] text-sky-600 dark:text-sky-400">
                TradePilot
              </p>
              <h1 className="text-lg font-semibold tracking-tight text-slate-950 dark:text-white">
                {pageTitle}
              </h1>
            </div>
            <div className="ml-auto inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              Live
            </div>
          </div>
        </header>

        <main className="flex-1">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="px-4 py-5 sm:px-6 sm:py-6"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
