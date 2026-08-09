import axios from 'axios';

import { parseClientEnv } from '@tradepilot/config';
import {
  AccountDTO,
  AccountStatusDTO,
  AnalyticsSummaryDTO,
  ApiKeyDTO,
  ApiKeySecretResult,
  ChangePasswordInput,
  CopierLinkDTO,
  CopierOverviewDTO,
  CopyEventDTO,
  CotHistoryDTO,
  CotAiAnalysisDTO,
  CotMarketListDTO,
  CotReportDTO,
  CotReportMode,
  CreateAccountInput,
  CreateApiKeyInput,
  CreateCopierLinkInput,
  DailyTradeSummaryDTO,
  DashboardOverviewDTO,
  EconomicCalendarDTO,
  EconomicIndicatorDetailDTO,
  ExecutionLogDTO,
  NewsRange,
  NotificationPreferencesDTO,
  RequestEmailChangeInput,
  SettingsDTO,
  TradeApiCloseInput,
  TradeApiCommandResult,
  TradeApiModifyInput,
  TradeApiOpenInput,
  TradeExecutionDTO,
  TradeHistoryFileDTO,
  UpdateCopierLinkInput,
  UpdateProfileInput,
  UserDTO,
  UserSessionDTO,
  VerifyEmailChangeInput,
} from '@tradepilot/shared';

import { getDeviceId } from './device-id';

const env = parseClientEnv(import.meta.env as Record<string, unknown>);

export const api = axios.create({
  baseURL: env.VITE_API_BASE_URL,
  withCredentials: true,
});

// Lets the server fold repeat sign-ins from this browser into one session row.
api.interceptors.request.use((config) => {
  config.headers.set('x-device-id', getDeviceId());
  return config;
});

export const clientEnv = env;

export const apiClient = {
  /* ── profile & auth ────────────────────────────────────────────────────── */
  async profile() {
    const { data } = await api.get<UserDTO>('/auth/me');
    return data;
  },
  async updateProfile(payload: UpdateProfileInput) {
    const { data } = await api.put<UserDTO>('/users/me', payload);
    return data;
  },
  async requestEmailChange(payload: RequestEmailChangeInput) {
    const { data } = await api.post<UserDTO>('/users/email-change/request', payload);
    return data;
  },
  async verifyEmailChange(payload: VerifyEmailChangeInput) {
    const { data } = await api.post<UserDTO>('/users/email-change/verify', payload);
    return data;
  },
  async changePassword(payload: ChangePasswordInput) {
    const { data } = await api.post<{ success: boolean }>('/users/password/change', payload);
    return data;
  },
  async sessions() {
    const { data } = await api.get<UserSessionDTO[]>('/users/sessions');
    return data;
  },
  async logoutAllSessions() {
    const { data } = await api.post<{ success: boolean }>('/users/sessions/logout-all');
    return data;
  },

  /* ── api keys ──────────────────────────────────────────────────────────── */
  async apiKeys() {
    const { data } = await api.get<ApiKeyDTO[]>('/api-keys');
    return data;
  },
  async createApiKey(payload: CreateApiKeyInput) {
    const { data } = await api.post<ApiKeySecretResult>('/api-keys', payload);
    return data;
  },
  async rotateApiKey(keyId: string, graceHours: number) {
    const { data } = await api.post<ApiKeySecretResult>(`/api-keys/${keyId}/rotate`, {
      graceHours,
    });
    return data;
  },
  async revokeApiKey(keyId: string) {
    const { data } = await api.delete<{ success: boolean }>(`/api-keys/${keyId}`);
    return data;
  },

  /* ── settings ──────────────────────────────────────────────────────────── */
  async settings() {
    const { data } = await api.get<SettingsDTO>('/settings');
    return data;
  },
  async updateSettings(payload: SettingsDTO) {
    const { data } = await api.put<SettingsDTO>('/settings', payload);
    return data;
  },
  async updateAutoCopy(enabled: boolean) {
    const { data } = await api.put<SettingsDTO>('/settings/auto-copy', { enabled });
    return data;
  },
  async updateApiTradeOpening(enabled: boolean) {
    const { data } = await api.put<SettingsDTO>('/settings/api-trade-opening', { enabled });
    return data;
  },
  async notificationPreferences() {
    const { data } = await api.get<NotificationPreferencesDTO>('/notifications/preferences');
    return data;
  },
  async updateNotificationPreferences(payload: NotificationPreferencesDTO) {
    const { data } = await api.put<NotificationPreferencesDTO>(
      '/notifications/preferences',
      payload,
    );
    return data;
  },

  /* ── accounts ──────────────────────────────────────────────────────────── */
  async accounts() {
    const { data } = await api.get<AccountDTO[]>('/accounts');
    return data;
  },
  async accountsIncludingHidden() {
    const { data } = await api.get<AccountDTO[]>('/accounts', {
      params: { includeHidden: 'true' },
    });
    return data;
  },
  async accountStatus(accountId?: string) {
    const { data } = await api.get<AccountStatusDTO | null>('/accounts/status', {
      params: accountId ? { accountId } : undefined,
    });
    return data;
  },
  async accountStatusHistory(accountId?: string, limit = 50) {
    const { data } = await api.get<AccountStatusDTO[]>('/accounts/status/history', {
      params: { limit, ...(accountId ? { accountId } : {}) },
    });
    return data;
  },
  async createAccount(payload: CreateAccountInput) {
    const { data } = await api.post<AccountDTO>('/accounts', payload);
    return data;
  },
  async deleteAccount(id: string) {
    await api.delete(`/accounts/${id}`);
  },
  async hideAccount(id: string) {
    const { data } = await api.post<AccountDTO>(`/accounts/${id}/hide`);
    return data;
  },
  async renameAccount(id: string, displayName: string | null) {
    const { data } = await api.put<AccountDTO>(`/accounts/${id}/name`, { displayName });
    return data;
  },
  async resetAllAccounts() {
    const { data } = await api.delete<{ deletedAccounts: number }>('/accounts/reset-all');
    return data;
  },
  async promoteToMaster(id: string) {
    const { data } = await api.post<AccountDTO[]>(`/accounts/${id}/promote-master`);
    return data;
  },
  async deleteAccountRecords(id: string) {
    await api.delete(`/accounts/${id}/records`);
  },

  /* ── copier ────────────────────────────────────────────────────────────── */
  async copierOverview() {
    const { data } = await api.get<CopierOverviewDTO>('/copier/overview');
    return data;
  },
  async copierLinks() {
    const { data } = await api.get<CopierLinkDTO[]>('/copier/links');
    return data;
  },
  async createCopierLink(payload: CreateCopierLinkInput) {
    const { data } = await api.post<CopierLinkDTO>('/copier/links', payload);
    return data;
  },
  async updateCopierLink(linkId: string, payload: UpdateCopierLinkInput) {
    const { data } = await api.put<CopierLinkDTO>(`/copier/links/${linkId}`, payload);
    return data;
  },
  async deleteCopierLink(linkId: string) {
    await api.delete(`/copier/links/${linkId}`);
  },
  async setMasterAccount(accountId: string | null) {
    const { data } = await api.put<{ success: boolean }>('/copier/master', { accountId });
    return data;
  },
  async copyEvents(limit = 25) {
    const { data } = await api.get<CopyEventDTO[]>('/copier/events', { params: { limit } });
    return data;
  },

  /* ── manual trading (session-authed, from the dashboard) ───────────────── */
  async manualPositions(accountId: string) {
    const { data } = await api.get<TradeExecutionDTO[]>('/trades/positions', {
      params: { accountId },
    });
    return data;
  },
  async manualOpen(payload: TradeApiOpenInput) {
    const { data } = await api.post<TradeApiCommandResult>('/trades/open', payload);
    return data;
  },
  async manualClose(payload: TradeApiCloseInput) {
    const { data } = await api.post<TradeApiCommandResult>('/trades/close', payload);
    return data;
  },
  async manualModify(payload: TradeApiModifyInput) {
    const { data } = await api.post<TradeApiCommandResult>('/trades/modify', payload);
    return data;
  },

  /* ── economic calendar ─────────────────────────────────────────────────── */
  async newsCalendar(range: NewsRange) {
    const { data } = await api.get<EconomicCalendarDTO>('/news/calendar', { params: { range } });
    return data;
  },

  /* ── commitments of traders ────────────────────────────────────────────── */
  async cotMarkets() {
    const { data } = await api.get<CotMarketListDTO>('/cot/markets');
    return data;
  },

  async cotReport(code: string, mode: CotReportMode) {
    const { data } = await api.get<CotReportDTO>(`/cot/reports/${code}`, { params: { mode } });
    return data;
  },

  async cotHistory(code: string, mode: CotReportMode) {
    const { data } = await api.get<CotHistoryDTO>(`/cot/reports/${code}/history`, {
      params: { mode },
    });
    return data;
  },
  async newsIndicator(title: string) {
    const { data } = await api.get<EconomicIndicatorDetailDTO>('/news/indicator', {
      params: { title },
    });
    return data;
  },

  async cotAnalysis(code: string, mode: CotReportMode) {
    const { data } = await api.get<CotAiAnalysisDTO>(`/cot/reports/${code}/analysis`, {
      params: { mode },
    });
    return data;
  },

  /* ── dashboard & analytics ─────────────────────────────────────────────── */
  async overview() {
    const { data } = await api.get<DashboardOverviewDTO>('/dashboard/overview');
    return data;
  },
  async executionAnalytics(accountId?: string, startDate?: string, endDate?: string) {
    const { data } = await api.get<AnalyticsSummaryDTO>('/analytics/summary', {
      params: {
        ...(accountId ? { accountId } : {}),
        ...(startDate ? { startDate } : {}),
        ...(endDate ? { endDate } : {}),
      },
    });
    return data;
  },
  async aiAnalysis(accountId?: string, startDate?: string, endDate?: string) {
    const { data } = await api.get<string>('/analytics/ai-analysis', {
      params: {
        ...(accountId ? { accountId } : {}),
        ...(startDate ? { startDate } : {}),
        ...(endDate ? { endDate } : {}),
      },
    });
    return data;
  },
  async dailySummary(startDate: string, endDate: string, accountId?: string) {
    const { data } = await api.get<DailyTradeSummaryDTO>('/analytics/daily-summary', {
      params: { startDate, endDate, ...(accountId ? { accountId } : {}) },
    });
    return data;
  },
  async executionTrades(accountId?: string, limit = 10) {
    const { data } = await api.get<TradeExecutionDTO[]>('/analytics/trades', {
      params: { limit, ...(accountId ? { accountId } : {}) },
    });
    return data;
  },
  async executionLogs(accountId?: string, limit = 10) {
    const { data } = await api.get<ExecutionLogDTO[]>('/analytics/logs', {
      params: { limit, ...(accountId ? { accountId } : {}) },
    });
    return data;
  },
  async tradeHistoryFiles() {
    const { data } = await api.get<TradeHistoryFileDTO[]>('/analytics/history-files');
    return data;
  },
  async uploadTradeHistoryFile(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await api.post<TradeHistoryFileDTO>('/analytics/history-files', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  },
  async deleteTradeHistoryFile(fileId: string) {
    await api.delete(`/analytics/history-files/${fileId}`);
  },
};
