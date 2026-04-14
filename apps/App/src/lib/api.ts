import axios from 'axios';

import { parseClientEnv } from '@tradepilot/config';
import {
  AccountDTO,
  AccountStatusDTO,
  AnalyticsSummaryDTO,
  CreateAccountInput,
  DashboardOverviewDTO,
  ExecutionLogDTO,
  SettingsDTO,
  SignalRecordDTO,
  TelegramChannelDTO,
  TelegramChannelSyncResult,
  TelegramConnectCodeInput,
  TelegramConnectPasswordInput,
  TelegramConnectStartInput,
  TelegramConnectStartResult,
  TelegramConnectionDTO,
  TradeExecutionDTO,
  UserDTO,
} from '@tradepilot/shared';

import { supabase } from './supabase';

const env = parseClientEnv(import.meta.env as Record<string, unknown>);

export const api = axios.create({
  baseURL: env.VITE_API_BASE_URL,
});

api.interceptors.request.use(async (config) => {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session?.access_token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${session.access_token}`;
  }

  return config;
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
  async accountStatus() {
    const { data } = await api.get<AccountStatusDTO | null>('/accounts/status');
    return data;
  },
  async createAccount(payload: CreateAccountInput) {
    const { data } = await api.post<AccountDTO>('/accounts', payload);
    return data;
  },
  async deleteAccount(id: string) {
    await api.delete(`/accounts/${id}`);
  },
  async signals() {
    const { data } = await api.get<SignalRecordDTO[]>('/signals');
    return data;
  },
  async executionLogs() {
    const { data } = await api.get<ExecutionLogDTO[]>('/execution/logs');
    return data;
  },
  async executionTrades() {
    const { data } = await api.get<TradeExecutionDTO[]>('/execution/trades');
    return data;
  },
  async executionAnalytics() {
    const { data } = await api.get<AnalyticsSummaryDTO>('/execution/analytics');
    return data;
  },
};
