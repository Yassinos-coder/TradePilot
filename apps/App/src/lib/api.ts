import axios from 'axios';

import { parseClientEnv } from '@tradepilot/config';
import {
  AccountDTO,
  AccountStatusDTO,
  AnalyticsSummaryDTO,
  ChangePasswordInput,
  CopierProgramDTO,
  CreateAccountInput,
  CreateCopierProgramInput,
  DailyTradeSummaryDTO,
  DashboardOverviewDTO,
  ExecutionLogDTO,
  FollowerDeviceDTO,
  NotificationPreferencesDTO,
  RequestEmailChangeInput,
  SettingsDTO,
  SignalHistoryFilter,
  SignalRecordDTO,
  SoftDeleteSignalsInput,
  TelegramChannelDTO,
  TelegramChannelSyncResult,
  TelegramConnectCodeInput,
  TelegramConnectPasswordInput,
  TelegramConnectStartInput,
  TelegramConnectStartResult,
  TelegramConnectionDTO,
  TradeExecutionDTO,
  TradeHistoryFileDTO,
  UpdateCopierProgramInput,
  UpdateProfileInput,
  UserDTO,
  UserSessionDTO,
  VerifyEmailChangeInput,
} from '@tradepilot/shared';


const env = parseClientEnv(import.meta.env as Record<string, unknown>);

export const api = axios.create({
  baseURL: env.VITE_API_BASE_URL,
  withCredentials: true,
});

export const clientEnv = env;

export const apiClient = {
  async profile() {
    const { data } = await api.get<UserDTO>('/auth/me');
    return data;
  },
  async regenerateApiKey() {
    const { data } = await api.post<UserDTO>('/users/api-key/regenerate');
    return data;
  },
  async overview() {
    const { data } = await api.get<DashboardOverviewDTO>('/dashboard/overview');
    return data;
  },
  async settings() {
    const { data } = await api.get<SettingsDTO>('/settings');
    return data;
  },
  async updateSettings(payload: SettingsDTO) {
    const { data } = await api.put<SettingsDTO>('/settings', payload);
    return data;
  },
  async telegramConnection() {
    const { data } = await api.get<TelegramConnectionDTO>('/telegram/connection');
    return data;
  },
  async startTelegramConnection(payload: TelegramConnectStartInput) {
    const { data } = await api.post<TelegramConnectStartResult>(
      '/telegram/connect/start',
      payload,
    );
    return data;
  },
  async verifyTelegramCode(payload: TelegramConnectCodeInput) {
    const { data } = await api.post<TelegramConnectionDTO>(
      '/telegram/connect/verify-code',
      payload,
    );
    return data;
  },
  async verifyTelegramPassword(payload: TelegramConnectPasswordInput) {
    const { data } = await api.post<TelegramConnectionDTO>(
      '/telegram/connect/verify-password',
      payload,
    );
    return data;
  },
  async disconnectTelegramConnection() {
    const { data } = await api.post<TelegramConnectionDTO>('/telegram/connect/disconnect');
    return data;
  },
  async syncTelegramChannels() {
    const { data } = await api.post<TelegramChannelSyncResult>('/telegram/channels/sync');
    return data;
  },
  async channels() {
    const { data } = await api.get<TelegramChannelDTO[]>('/telegram/channels');
    return data;
  },
  async toggleChannel(channelId: string) {
    const { data } = await api.post<TelegramChannelDTO>(`/telegram/channels/${channelId}/toggle`);
    return data;
  },
  async accounts() {
    const { data } = await api.get<AccountDTO[]>('/accounts');
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
      params: {
        limit,
        ...(accountId ? { accountId } : {}),
      },
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
  async deleteAccountRecords(id: string) {
    await api.delete(`/accounts/${id}/records`);
  },
  async signals(options?: {
    limit?: number;
    filter?: SignalHistoryFilter;
    includeNoise?: boolean;
  }) {
    const { data } = await api.get<SignalRecordDTO[]>('/signals', {
      params: {
        limit: options?.limit,
        filter: options?.filter,
        includeNoise: options?.includeNoise ? 'true' : undefined,
      },
    });
    return data;
  },
  async softDeleteSignals(payload: SoftDeleteSignalsInput) {
    const { data } = await api.post<{ deletedCount: number }>('/signals/history/delete', payload);
    return data;
  },
  async updateAutoCopy(enabled: boolean) {
    const { data } = await api.put<SettingsDTO>('/settings/auto-copy', { enabled });
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
  async executionLogs(accountId?: string) {
    const { data } = await api.get<ExecutionLogDTO[]>('/execution/logs', {
      params: accountId ? { accountId } : undefined,
    });
    return data;
  },
  async executionTrades(accountId?: string, limit = 10) {
    const { data } = await api.get<TradeExecutionDTO[]>('/execution/trades', {
      params: { limit, ...(accountId ? { accountId } : {}) },
    });
    return data;
  },
  async executionAnalytics(accountId?: string, startDate?: string, endDate?: string) {
    const { data } = await api.get<AnalyticsSummaryDTO>('/execution/analytics', {
      params: { ...(accountId ? { accountId } : {}), ...(startDate ? { startDate } : {}), ...(endDate ? { endDate } : {}) },
    });
    return data;
  },
  async aiAnalysis(accountId?: string, startDate?: string, endDate?: string) {
    const { data } = await api.get<string>('/execution/ai-analysis', {
      params: { ...(accountId ? { accountId } : {}), ...(startDate ? { startDate } : {}), ...(endDate ? { endDate } : {}) },
    });
    return data;
  },
  async dailySummary(startDate: string, endDate: string, accountId?: string) {
    const { data } = await api.get<DailyTradeSummaryDTO>('/execution/daily-summary', {
      params: { startDate, endDate, ...(accountId ? { accountId } : {}) },
    });
    return data;
  },
  async tradeHistoryFiles() {
    const { data } = await api.get<TradeHistoryFileDTO[]>('/execution/history-files');
    return data;
  },
  async uploadTradeHistoryFile(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await api.post<TradeHistoryFileDTO>('/execution/history-files', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  },
  async deleteTradeHistoryFile(fileId: string) {
    await api.delete(`/execution/history-files/${fileId}`);
  },
  async dispatchManual(signalId: string, accountId: string) {
    await api.post(`/execution/${signalId}/dispatch-manual`, { accountId });
  },
  async copierPrograms() {
    const { data } = await api.get<CopierProgramDTO[]>('/trade-copier/programs');
    return data;
  },
  async createCopierProgram(payload: CreateCopierProgramInput) {
    const { data } = await api.post<CopierProgramDTO>('/trade-copier/programs', payload);
    return data;
  },
  async updateCopierProgram(programId: string, payload: UpdateCopierProgramInput) {
    const { data } = await api.put<CopierProgramDTO>(`/trade-copier/programs/${programId}`, payload);
    return data;
  },
  async rotateCopierInviteCode(programId: string) {
    const { data } = await api.post<CopierProgramDTO>(
      `/trade-copier/programs/${programId}/invite-code/rotate`,
    );
    return data;
  },
  async copierFollowers(programId: string) {
    const { data } = await api.get<FollowerDeviceDTO[]>(
      `/trade-copier/programs/${programId}/followers`,
    );
    return data;
  },
  async approveCopierFollower(programId: string, deviceId: string) {
    const { data } = await api.post<FollowerDeviceDTO>(
      `/trade-copier/programs/${programId}/followers/${deviceId}/approve`,
    );
    return data;
  },
  async revokeCopierFollower(programId: string, deviceId: string) {
    const { data } = await api.post<FollowerDeviceDTO>(
      `/trade-copier/programs/${programId}/followers/${deviceId}/revoke`,
    );
    return data;
  },
};
