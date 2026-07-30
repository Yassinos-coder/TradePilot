import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  BarChart3,
  CandlestickChart,
  Copy,
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

import { useAppUpdate } from '@/hooks/useAppUpdate';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth-store';
import { useThemeStore } from '@/store/theme-store';

const NAV = [
  { to: '/app', label: 'Overview', icon: LayoutDashboard },
  { to: '/app/copier', label: 'Trade Copier', icon: Copy },
  { to: '/app/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/app/open-trades', label: 'Open Trades', icon: CandlestickChart },
  { to: '/app/accounts', label: 'Accounts', icon: Wallet },
  { to: '/app/settings', label: 'Settings', icon: Settings2 },
] as const;

const PAGE_TITLES: Record<string, string> = {
  '/app': 'Overview',
  '/app/copier': 'Trade Copier',
  '/app/analytics': 'Analytics',
  '/app/open-trades': 'Open Trades',
  '/app/accounts': 'Accounts',
  '/app/settings': 'Settings',
};

interface SidebarProps {
  onNavigate?: () => void;
  versionLabel: string;
}

function SidebarContent({ onNavigate, versionLabel }: SidebarProps) {
  const logout = useAuthStore((state) => state.logout);
  const user = useAuthStore((state) => state.user);
  const { theme, toggleTheme } = useThemeStore();
  const initials = user?.email?.slice(0, 2).toUpperCase() ?? 'TP';

  return (
    <div className="bg-sidebar flex h-full flex-col">
      <div className="flex h-16 items-center gap-3 px-5">
        <div className="bg-brand flex h-9 w-9 items-center justify-center rounded-xl">
          <Activity className="h-4 w-4 text-white" />
        </div>
        <p className="text-base font-semibold tracking-tight text-white">TradePilot</p>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/app'}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-brand text-white'
                  : 'text-sidebar-fg hover:bg-white/5 hover:text-white',
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  className={cn('h-4 w-4 shrink-0', isActive ? 'text-white' : 'text-sidebar-fg')}
                />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-sidebar-line space-y-2 border-t p-3">
        <button
          type="button"
          onClick={toggleTheme}
          className="text-sidebar-fg flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors hover:bg-white/5 hover:text-white"
        >
          {theme === 'dark' ? (
            <Sun className="h-4 w-4 text-warning" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>

        <div className="flex items-center gap-3 rounded-xl px-3 py-2.5">
          <div className="bg-brand flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white">
            {initials}
          </div>
          <span className="text-sidebar-fg min-w-0 flex-1 truncate text-xs">
            {user?.email ?? '--'}
          </span>
          <button
            type="button"
            onClick={() => void logout()}
            title="Sign out"
            aria-label="Sign out"
            className="text-sidebar-fg cursor-pointer rounded-lg p-2 transition-colors hover:bg-white/5 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>

        <p className="text-sidebar-fg px-3 pb-1 text-[11px]">{versionLabel}</p>
      </div>
    </div>
  );
}

export function AppShell() {
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { currentManifest, availableManifest, hasUpdate, isRefreshing, dismiss, refreshToLatest } =
    useAppUpdate();
  const pageTitle = PAGE_TITLES[location.pathname] ?? 'TradePilot';
  const versionLabel = `v${currentManifest.version}`;

  return (
    <div className="bg-canvas min-h-screen">
      <div className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:block lg:w-64">
        <SidebarContent versionLabel={versionLabel} />
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
              className="bg-overlay fixed inset-0 z-40 backdrop-blur-sm lg:hidden"
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="fixed inset-y-0 left-0 z-50 w-[80vw] max-w-xs shadow-2xl lg:hidden"
            >
              <div className="absolute top-3 right-3 z-10">
                <button
                  type="button"
                  onClick={() => setMobileNavOpen(false)}
                  aria-label="Close navigation"
                  className="text-sidebar-fg cursor-pointer rounded-lg p-2 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <SidebarContent
                onNavigate={() => setMobileNavOpen(false)}
                versionLabel={versionLabel}
              />
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>

      <div className="flex min-h-screen flex-col lg:pl-64">
        <header className="border-line bg-surface sticky top-0 z-30 border-b px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation"
              className="border-line text-content-secondary flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border lg:hidden"
            >
              <Menu className="h-4 w-4" />
            </button>
            <h1 className="text-content-primary text-xl font-semibold tracking-tight">
              {pageTitle}
            </h1>
            <div className="border-positive/20 bg-positive-subtle text-positive-content ml-auto inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium">
              <span className="bg-positive h-2 w-2 animate-pulse rounded-full" />
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
              className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6 sm:py-6"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <AnimatePresence>
        {hasUpdate && availableManifest ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="fixed right-4 bottom-4 z-[70] w-[min(92vw,380px)]"
          >
            <div className="border-line bg-surface rounded-card overflow-hidden border shadow-2xl">
              <div className="border-line-subtle border-b px-5 py-4">
                <p className="text-brand text-[11px] font-semibold tracking-widest uppercase">
                  Update available
                </p>
                <h2 className="text-content-primary mt-1 text-base font-semibold tracking-tight">
                  A newer TradePilot build is ready
                </h2>
              </div>
              <div className="space-y-4 px-5 py-4">
                <p className="text-content-secondary text-sm leading-6">
                  Refresh to load the latest build and clear cached assets.
                </p>
                <div className="border-line bg-surface-muted text-content-secondary rounded-lg border px-4 py-3 text-xs leading-5">
                  New version: v{availableManifest.version}
                  <br />
                  Built: {new Date(availableManifest.builtAt).toLocaleString()}
                </div>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={dismiss}
                    className="text-content-secondary hover:bg-surface-muted hover:text-content-primary cursor-pointer rounded-lg px-3 py-2 text-sm font-medium transition-colors"
                  >
                    Later
                  </button>
                  <button
                    type="button"
                    onClick={() => void refreshToLatest()}
                    disabled={isRefreshing}
                    className="bg-brand text-brand-fg hover:bg-brand-hover inline-flex cursor-pointer items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isRefreshing ? 'Refreshing…' : 'Refresh now'}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
