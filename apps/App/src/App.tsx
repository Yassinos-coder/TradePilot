import { lazy, Suspense, useEffect } from 'react';
import axios from 'axios';
import { useQuery } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { apiClient } from './lib/api';
import { useAuthStore } from './store/auth-store';
import { SeoManager } from './components/seo/SeoManager';

const AppShell = lazy(() => import('./components/layout/AppShell').then((module) => ({ default: module.AppShell })));
const AccountsPage = lazy(() => import('./pages/AccountsPage').then((module) => ({ default: module.AccountsPage })));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage').then((module) => ({ default: module.AnalyticsPage })));
const AuthCallbackPage = lazy(() => import('./pages/AuthCallbackPage').then((module) => ({ default: module.AuthCallbackPage })));
const AuthPage = lazy(() => import('./pages/AuthPage').then((module) => ({ default: module.AuthPage })));
const CalculatorsPage = lazy(() => import('./pages/CalculatorsPage').then((module) => ({ default: module.CalculatorsPage })));
const CopierPage = lazy(() => import('./pages/CopierPage').then((module) => ({ default: module.CopierPage })));
const CotReportPage = lazy(() => import('./pages/CotReportPage').then((module) => ({ default: module.CotReportPage })));
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((module) => ({ default: module.DashboardPage })));
const LandingPage = lazy(() => import('./pages/LandingPage').then((module) => ({ default: module.LandingPage })));
const NewsCalendarPage = lazy(() => import('./pages/NewsCalendarPage').then((module) => ({ default: module.NewsCalendarPage })));
const OpenTradesPage = lazy(() => import('./pages/OpenTradesPage').then((module) => ({ default: module.OpenTradesPage })));
const PricingPage = lazy(() => import('./pages/PricingPage').then((module) => ({ default: module.PricingPage })));
const PrivacyPage = lazy(() => import('./pages/PrivacyPage').then((module) => ({ default: module.PrivacyPage })));
const RefundPage = lazy(() => import('./pages/RefundPage').then((module) => ({ default: module.RefundPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((module) => ({ default: module.SettingsPage })));
const TermsPage = lazy(() => import('./pages/TermsPage').then((module) => ({ default: module.TermsPage })));
const ToolsPage = lazy(() => import('./pages/ToolsPage').then((module) => ({ default: module.ToolsPage })));
const TradeCopierPage = lazy(() => import('./pages/TradeCopierPage').then((module) => ({ default: module.TradeCopierPage })));

function RouteFallback() {
  return (
    <div className="bg-canvas flex min-h-screen items-center justify-center" role="status">
      <div className="text-content-secondary flex items-center gap-3 text-sm">
        <span aria-hidden className="border-brand h-4 w-4 animate-spin rounded-full border-2 border-t-transparent" />
        Loading…
      </div>
    </div>
  );
}

function ProtectedLayout() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isLoading = useAuthStore((state) => state.isLoading);
  const user = useAuthStore((state) => state.user);
  const updateUser = useAuthStore((state) => state.updateUser);
  const logout = useAuthStore((state) => state.logout);

  const profileQuery = useQuery({
    queryKey: ['profile'],
    queryFn: apiClient.profile,
    enabled: isAuthenticated,
    retry: false,
  });

  useEffect(() => {
    if (profileQuery.data) {
      updateUser(profileQuery.data);
    }
  }, [profileQuery.data, updateUser]);

  useEffect(() => {
    if (axios.isAxiosError(profileQuery.error) && profileQuery.error.response?.status === 401) {
      void logout();
    }
  }, [profileQuery.error, logout]);

  if (isLoading) {
    return (
      <div className="bg-canvas flex min-h-screen items-center justify-center">
        <div className="text-content-secondary flex items-center gap-3 text-sm">
          <span className="border-brand h-4 w-4 animate-spin rounded-full border-2 border-t-transparent" />
          Loading workspace…
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth" replace />;
  }

  if (!user && profileQuery.isLoading) {
    return (
      <div className="bg-canvas flex min-h-screen items-center justify-center">
        <div className="text-content-secondary flex items-center gap-3 text-sm">
          <span className="border-brand h-4 w-4 animate-spin rounded-full border-2 border-t-transparent" />
          Syncing account…
        </div>
      </div>
    );
  }

  return <AppShell />;
}

export default function App() {
  const initialize = useAuthStore((state) => state.initialize);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  return (
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <SeoManager />
      <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/" element={<LandingPage />} />
        <Route path="/trade-copier" element={<TradeCopierPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/refund" element={<RefundPage />} />
        <Route element={<ProtectedLayout />}>
          <Route path="/app" element={<DashboardPage />} />
          <Route path="/app/analytics" element={<AnalyticsPage />} />
          <Route path="/app/copier" element={<CopierPage />} />
          <Route path="/app/calculators" element={<CalculatorsPage />} />
          <Route path="/app/open-trades" element={<OpenTradesPage />} />
          <Route path="/app/news" element={<NewsCalendarPage />} />
          <Route path="/app/cot" element={<CotReportPage />} />
          <Route path="/app/tools" element={<ToolsPage />} />
          <Route path="/app/settings" element={<SettingsPage />} />
          <Route path="/app/accounts" element={<AccountsPage />} />
        </Route>
        <Route path="/app/trade-copier" element={<Navigate to="/app/copier" replace />} />
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
