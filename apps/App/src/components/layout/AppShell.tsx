import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  Settings2,
  Send,
  Wallet,
  BarChart3,
  LogOut,
  Sun,
  Moon,
  Activity,
  ChevronRight,
} from 'lucide-react';

import { useAuthStore } from '../../store/auth-store';
import { useThemeStore } from '../../store/theme-store';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: Settings2 },
  { to: '/telegram', label: 'Telegram', icon: Send },
  { to: '/accounts', label: 'Accounts', icon: Wallet },
] as const;

const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/analytics': 'Analytics',
  '/settings': 'Settings',
  '/telegram': 'Telegram',
  '/accounts': 'Accounts',
};

export function AppShell() {
  const logout = useAuthStore((state) => state.logout);
  const user = useAuthStore((state) => state.user);
  const { theme, toggleTheme } = useThemeStore();
  const location = useLocation();

  const pageTitle = PAGE_TITLES[location.pathname] ?? 'TradePilot';
  const initials = user?.email?.slice(0, 2).toUpperCase() ?? 'TP';

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 flex w-60 flex-col bg-white dark:bg-slate-900 border-r border-gray-200 dark:border-slate-800">
        {/* Brand */}
        <div className="flex h-16 items-center gap-3 border-b border-gray-200 dark:border-slate-800 px-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
            <Activity className="h-4 w-4 text-white" />
          </div>
          <span className="text-sm font-semibold text-gray-900 dark:text-white tracking-tight">
            TradePilot
          </span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                [
                  'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400'
                    : 'text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-slate-100',
                ].join(' ')
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className={[
                      'h-4 w-4 shrink-0',
                      isActive
                        ? 'text-blue-600 dark:text-blue-400'
                        : 'text-gray-400 dark:text-slate-500 group-hover:text-gray-600 dark:group-hover:text-slate-300',
                    ].join(' ')}
                  />
                  {label}
                  {isActive && (
                    <ChevronRight className="ml-auto h-3.5 w-3.5 text-blue-500 dark:text-blue-400 opacity-60" />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="border-t border-gray-200 dark:border-slate-800 p-3 space-y-1">
          {/* Theme toggle */}
          <button
            type="button"
            onClick={toggleTheme}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-slate-100 transition-colors"
          >
            {theme === 'dark' ? (
              <Sun className="h-4 w-4 text-amber-500" />
            ) : (
              <Moon className="h-4 w-4 text-slate-400" />
            )}
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>

          {/* User row */}
          <div className="flex items-center gap-3 rounded-lg px-3 py-2.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white">
              {initials}
            </div>
            <span className="flex-1 truncate text-xs text-gray-500 dark:text-slate-500">
              {user?.email ?? '—'}
            </span>
            <button
              type="button"
              onClick={() => void logout()}
              title="Sign out"
              className="rounded-md p-1 text-gray-400 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col pl-60">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-16 items-center border-b border-gray-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm px-6 gap-4">
          <h1 className="text-sm font-semibold text-gray-900 dark:text-slate-100">
            {pageTitle}
          </h1>
          <div className="ml-auto flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live
            </span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="p-6"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
