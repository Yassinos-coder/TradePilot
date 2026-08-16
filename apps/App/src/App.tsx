import { useEffect } from 'react';
import axios from 'axios';
import { useQuery } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { AppShell } from './components/layout/AppShell';
import { apiClient } from './lib/api';
import { useAuthStore } from './store/auth-store';
import { AccountsPage } from './pages/AccountsPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { AuthCallbackPage } from './pages/AuthCallbackPage';
import { AuthPage } from './pages/AuthPage';
import { DashboardPage } from './pages/DashboardPage';
import { LandingPage } from './pages/LandingPage';
import { NewsCalendarPage } from './pages/NewsCalendarPage';
import { OpenTradesPage } from './pages/OpenTradesPage';
import { PricingPage } from './pages/PricingPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { RefundPage } from './pages/RefundPage';
import { SettingsPage } from './pages/SettingsPage';
import { TermsPage } from './pages/TermsPage';
import { CopierPage } from './pages/CopierPage';
import { CalculatorsPage } from './pages/CalculatorsPage';
import { CotReportPage } from './pages/CotReportPage';
import { ToolsPage } from './pages/ToolsPage';
import { TradeCopierPage } from './pages/TradeCopierPage';
import { SeoManager } from './components/seo/SeoManager';

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
    </BrowserRouter>
  );
}
