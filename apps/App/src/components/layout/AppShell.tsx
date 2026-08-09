import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, Reorder, motion } from 'framer-motion';
import {
  BarChart3,
  Calculator,
  CalendarDays,
  CandlestickChart,
  Copy,
  Landmark,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Settings2,
  Sun,
  Wallet,
  X,
} from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';

import { useAppUpdate } from '@/hooks/useAppUpdate';
import { apiClient } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth-store';
import { useThemeStore } from '@/store/theme-store';
import { TradePilotLogo } from '@/components/brand/TradePilotLogo';

const NAV = [
  { to: '/app', label: 'Overview', icon: LayoutDashboard },
  { to: '/app/copier', label: 'Trade Copier', icon: Copy },
  { to: '/app/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/app/calculators', label: 'Calculators', icon: Calculator },
  { to: '/app/open-trades', label: 'Open Trades', icon: CandlestickChart },
  { to: '/app/news', label: 'News', icon: CalendarDays },
  { to: '/app/cot', label: 'COT Report', icon: Landmark },
  { to: '/app/accounts', label: 'Accounts', icon: Wallet },
  { to: '/app/settings', label: 'Settings', icon: Settings2 },
] as const;

type NavPath = (typeof NAV)[number]['to'];
const DEFAULT_NAV_ORDER = NAV.map((item) => item.to);

function normalizeNavOrder(order: readonly string[] | undefined): NavPath[] {
  const known = new Set<NavPath>(DEFAULT_NAV_ORDER);
  const saved = (order ?? []).filter(
    (path, index, values): path is NavPath =>
      known.has(path as NavPath) && values.indexOf(path) === index,
  );
  return [...saved, ...DEFAULT_NAV_ORDER.filter((path) => !saved.includes(path))];
}

function sidebarStorageKey(userId: string | undefined) {
  return userId ? `tradepilot:sidebar-order:${userId}` : null;
}

function readStoredNavOrder(userId: string | undefined): NavPath[] {
  const key = sidebarStorageKey(userId);
  if (!key) return DEFAULT_NAV_ORDER;
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? '[]') as unknown;
    return normalizeNavOrder(
      Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [],
    );
  } catch {
    return DEFAULT_NAV_ORDER;
  }
}

function writeStoredNavOrder(userId: string | undefined, order: NavPath[]) {
  const key = sidebarStorageKey(userId);
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(order));
  } catch {
    // Supabase remains the durable fallback when browser storage is unavailable.
  }
}

const PAGE_TITLES: Record<string, string> = {
  '/app': 'Overview',
  '/app/copier': 'Trade Copier',
  '/app/analytics': 'Analytics',
  '/app/calculators': 'Calculators',
  '/app/open-trades': 'Open Trades',
  '/app/news': 'Economic Calendar',
  '/app/cot': 'Commitments of Traders',
  '/app/accounts': 'Accounts',
  '/app/settings': 'Settings',
};

interface SidebarProps {
  onNavigate?: () => void;
  versionLabel: string;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  order: NavPath[];
  onOrderChange: (order: NavPath[]) => void;
  onOrderSave: () => void;
}

function SidebarContent({
  onNavigate,
  versionLabel,
  collapsed = false,
  onToggleCollapsed,
  order,
  onOrderChange,
  onOrderSave,
}: SidebarProps) {
  const logout = useAuthStore((state) => state.logout);
  const user = useAuthStore((state) => state.user);
  const { theme, toggleTheme } = useThemeStore();
  const initials = user?.email?.slice(0, 2).toUpperCase() ?? 'TP';

  return (
    <div className="bg-sidebar flex h-full flex-col">
      <div className={cn('flex h-16 items-center gap-3 px-5', collapsed && 'justify-center px-3')}>
        <TradePilotLogo compact={collapsed} showTagline={false} inverse />
        {onToggleCollapsed ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onToggleCollapsed();
            }}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={cn(
              'text-sidebar-fg ml-auto hidden cursor-pointer rounded-lg p-2 transition-colors hover:bg-white/5 hover:text-white lg:inline-flex',
              collapsed && 'ml-0',
            )}
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        ) : null}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <Reorder.Group axis="y" values={order} onReorder={onOrderChange} className="space-y-1">
          {order.map((path) => {
            const item = NAV.find(({ to }) => to === path);
            return item ? (
              <SidebarNavItem
                key={item.to}
                item={item}
                collapsed={collapsed}
                onNavigate={onNavigate}
                onOrderSave={onOrderSave}
              />
            ) : null;
          })}
        </Reorder.Group>
      </nav>

      <div className="border-sidebar-line space-y-2 border-t p-3">
        <button
          type="button"
          onClick={toggleTheme}
          className={cn(
            'text-sidebar-fg flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors hover:bg-white/5 hover:text-white',
            collapsed && 'justify-center px-2',
          )}
        >
          {theme === 'dark' ? (
            <Sun className="h-4 w-4 text-warning" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
          {!collapsed ? (theme === 'dark' ? 'Light mode' : 'Dark mode') : null}
        </button>

        <div className={cn('flex items-center gap-3 rounded-xl px-3 py-2.5', collapsed && 'justify-center px-2')}>
          <div className="bg-brand flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white">
            {initials}
          </div>
          {!collapsed ? (
            <span className="text-sidebar-fg min-w-0 flex-1 truncate text-xs">
              {user?.email ?? '--'}
            </span>
          ) : null}
          {!collapsed ? (
            <button
              type="button"
              onClick={() => void logout()}
              title="Sign out"
              aria-label="Sign out"
              className="text-sidebar-fg cursor-pointer rounded-lg p-2 transition-colors hover:bg-white/5 hover:text-white"
            >
              <LogOut className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        {!collapsed ? <p className="text-sidebar-fg px-3 pb-1 text-[11px]">{versionLabel}</p> : null}
      </div>
    </div>
  );
}

function SidebarNavItem({
  item: { to, label, icon: Icon },
  collapsed,
  onNavigate,
  onOrderSave,
}: {
  item: (typeof NAV)[number];
  collapsed: boolean;
  onNavigate?: () => void;
  onOrderSave: () => void;
}) {
  return (
    <Reorder.Item
      value={to}
      onDragEnd={onOrderSave}
      className="flex cursor-grab touch-none items-center active:cursor-grabbing"
      whileDrag={{ scale: 1.02, zIndex: 50 }}
    >
      <NavLink
        to={to}
        end={to === '/app'}
        onClick={onNavigate}
        title={collapsed ? label : undefined}
        className={({ isActive }) =>
          cn(
            'flex min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
            collapsed && 'justify-center px-2',
            isActive
              ? 'bg-brand text-white'
              : 'text-sidebar-fg hover:bg-white/5 hover:text-white',
          )
        }
      >
        {({ isActive }) => (
          <>
            <Icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-white' : 'text-sidebar-fg')} />
            {!collapsed ? <span className="truncate">{label}</span> : null}
          </>
        )}
      </NavLink>
    </Reorder.Item>
  );
}

export function AppShell() {
  const location = useLocation();
  const userId = useAuthStore((state) => state.user?.id ?? state.session?.user.id);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarOrder, setSidebarOrder] = useState<NavPath[]>(() => readStoredNavOrder(userId));
  const sidebarOrderRef = useRef<NavPath[]>(sidebarOrder);
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({ queryKey: ['settings'], queryFn: apiClient.settings });
  const sidebarOrderMutation = useMutation({
    mutationFn: apiClient.updateSidebarOrder,
    onSuccess: (settings) => queryClient.setQueryData(['settings'], settings),
  });

  useEffect(() => {
    const restored = readStoredNavOrder(userId);
    sidebarOrderRef.current = restored;
    setSidebarOrder(restored);
  }, [userId]);

  useEffect(() => {
    if (!settingsQuery.data) return;
    const restored = normalizeNavOrder(settingsQuery.data.sidebarOrder);
    sidebarOrderRef.current = restored;
    setSidebarOrder(restored);
    writeStoredNavOrder(userId, restored);
  }, [settingsQuery.data, userId]);

  const reorderSidebar = (order: NavPath[]) => {
    sidebarOrderRef.current = order;
    setSidebarOrder(order);
  };

  const saveSidebarOrder = () => {
    writeStoredNavOrder(userId, sidebarOrderRef.current);
    sidebarOrderMutation.mutate(sidebarOrderRef.current);
  };
  const { currentManifest, availableManifest, hasUpdate, isRefreshing, dismiss, refreshToLatest } =
    useAppUpdate();
  const pageTitle = PAGE_TITLES[location.pathname] ?? 'TradePilot';
  const versionLabel = `v${currentManifest.version}`;

  return (
    <div className="bg-canvas min-h-screen">
      <div
        role="button"
        tabIndex={sidebarCollapsed ? 0 : -1}
        onClick={() => {
          if (sidebarCollapsed) setSidebarCollapsed(false);
        }}
        onKeyDown={(event) => {
          if (sidebarCollapsed && (event.key === 'Enter' || event.key === ' ')) setSidebarCollapsed(false);
        }}
        className={cn(
          'hidden transition-[width] duration-200 lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:block',
          sidebarCollapsed ? 'lg:w-20 cursor-pointer' : 'lg:w-64',
        )}
      >
        <SidebarContent
          versionLabel={versionLabel}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={() => setSidebarCollapsed((value) => !value)}
          order={sidebarOrder}
          onOrderChange={reorderSidebar}
          onOrderSave={saveSidebarOrder}
        />
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
                order={sidebarOrder}
                onOrderChange={reorderSidebar}
                onOrderSave={saveSidebarOrder}
              />
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>

      <div className={cn('flex min-h-screen flex-col transition-[padding] duration-200', sidebarCollapsed ? 'lg:pl-20' : 'lg:pl-64')}>
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
