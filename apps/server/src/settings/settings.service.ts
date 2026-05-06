import { Injectable, InternalServerErrorException } from '@nestjs/common';

import {
  DEFAULT_AUTO_COPY_ENABLED,
  DEFAULT_EXCLUDED_SYMBOLS,
  DEFAULT_EXECUTION_MODE,
  DEFAULT_LOW_MARGIN_THRESHOLD_PERCENT,
  DEFAULT_MAX_DAILY_LOSS_PERCENT,
  DEFAULT_MAX_SIMULTANEOUS_TRADES,
  DEFAULT_MAX_TRADES_PER_DAY,
  DEFAULT_SESSIONS,
  SUPPORTED_SYMBOLS,
} from '@tradepilot/config';
import { SettingsDTO, settingsDtoSchema } from '@tradepilot/shared';

import { DatabaseService } from '../database/database.service';
import { SettingsRecord } from '../database/database.types';

@Injectable()
export class SettingsService {
  constructor(private readonly databaseService: DatabaseService) {}

  async getSettings(userId: string): Promise<SettingsDTO> {
    const client = this.databaseService.getClient();
    const { data: existingSettings, error } = await client
      .from('settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    if (existingSettings) {
      return this.toSettingsDto(existingSettings as SettingsRecord);
    }

    const { data: createdSettings, error: createError } = await client
      .from('settings')
      .insert({
        user_id: userId,
        risk_percent: 1,
        max_trades: 3,
        max_simultaneous_trades: DEFAULT_MAX_SIMULTANEOUS_TRADES,
        max_daily_loss_percent: DEFAULT_MAX_DAILY_LOSS_PERCENT,
        max_trades_per_day: DEFAULT_MAX_TRADES_PER_DAY,
        low_margin_threshold_percent: DEFAULT_LOW_MARGIN_THRESHOLD_PERCENT,
        auto_copy_enabled: DEFAULT_AUTO_COPY_ENABLED,
        execution_paused: false,
        execution_pause_reason: null,
        execution_paused_at: null,
        allowed_symbols: SUPPORTED_SYMBOLS,
        excluded_symbols: DEFAULT_EXCLUDED_SYMBOLS,
        sessions: DEFAULT_SESSIONS,
        mode: DEFAULT_EXECUTION_MODE,
        notification_channels: {
          email: true,
          telegram: true,
          whatsapp: false,
        },
        notification_events: {
          newTradeOpened: true,
          tpHit: true,
          slHit: true,
          lowMargin: true,
          eaDisconnected: true,
          telegramDisconnected: true,
          executionFailed: true,
          dailySummary: false,
        },
      })
      .select('*')
      .single();

    if (createError || !createdSettings) {
      throw new InternalServerErrorException(
        createError?.message ?? 'Failed to create user settings',
      );
    }

    return this.toSettingsDto(createdSettings as SettingsRecord);
  }

  async updateSettings(userId: string, payload: SettingsDTO): Promise<SettingsDTO> {
    const { data: settings, error } = await this.databaseService
      .getClient()
      .from('settings')
      .upsert(
        {
          user_id: userId,
          risk_percent: payload.riskPercent,
          max_trades: payload.maxTrades,
          max_simultaneous_trades: payload.maxSimultaneousTrades,
          max_daily_loss_percent: payload.maxDailyLossPercent,
          max_trades_per_day: payload.maxTradesPerDay,
          low_margin_threshold_percent: payload.lowMarginThresholdPercent,
          auto_copy_enabled: payload.autoCopyEnabled,
          execution_paused: payload.executionPaused,
          execution_pause_reason: payload.executionPauseReason,
          execution_paused_at: payload.executionPausedAt,
          allowed_symbols: SUPPORTED_SYMBOLS.filter(
            (symbol) => !payload.excludedSymbols.includes(symbol),
          ),
          excluded_symbols: payload.excludedSymbols,
          sessions: payload.sessions,
          mode: payload.mode,
          notification_channels: payload.notificationChannels,
          notification_events: payload.notificationEvents,
        },
        { onConflict: 'user_id' },
      )
      .select('*')
      .single();

    if (error || !settings) {
      throw new InternalServerErrorException(error?.message ?? 'Failed to update settings');
    }

    return this.toSettingsDto(settings as SettingsRecord);
  }

  async updateAutoCopy(userId: string, enabled: boolean): Promise<SettingsDTO> {
    const { data, error } = await this.databaseService
      .getClient()
      .from('settings')
      .update({
        auto_copy_enabled: enabled,
        execution_paused: !enabled,
        execution_pause_reason: enabled ? null : 'AUTO_COPY_DISABLED',
        execution_paused_at: enabled ? null : new Date().toISOString(),
      })
      .eq('user_id', userId)
      .select('*')
      .single();

    if (error || !data) {
      throw new InternalServerErrorException(
        error?.message ?? 'Failed to update auto copy setting',
      );
    }

    return this.toSettingsDto(data as SettingsRecord);
  }

  async setExecutionPause(
    userId: string,
    paused: boolean,
    reason: string | null,
  ): Promise<SettingsDTO> {
    const { data, error } = await this.databaseService
      .getClient()
      .from('settings')
      .update({
        execution_paused: paused,
        execution_pause_reason: paused ? reason : null,
        execution_paused_at: paused ? new Date().toISOString() : null,
        auto_copy_enabled: paused ? false : true,
      })
      .eq('user_id', userId)
      .select('*')
      .single();

    if (error || !data) {
      throw new InternalServerErrorException(
        error?.message ?? 'Failed to update execution pause state',
      );
    }

    return this.toSettingsDto(data as SettingsRecord);
  }

  private toSettingsDto(settings: SettingsRecord): SettingsDTO {
    return settingsDtoSchema.parse({
      riskPercent: settings.risk_percent,
      maxTrades: settings.max_trades,
      maxSimultaneousTrades:
        settings.max_simultaneous_trades ?? settings.max_trades ?? DEFAULT_MAX_SIMULTANEOUS_TRADES,
      maxDailyLossPercent:
        settings.max_daily_loss_percent ?? DEFAULT_MAX_DAILY_LOSS_PERCENT,
      maxTradesPerDay: settings.max_trades_per_day ?? DEFAULT_MAX_TRADES_PER_DAY,
      lowMarginThresholdPercent:
        settings.low_margin_threshold_percent ?? DEFAULT_LOW_MARGIN_THRESHOLD_PERCENT,
      autoCopyEnabled: settings.auto_copy_enabled ?? DEFAULT_AUTO_COPY_ENABLED,
      executionPaused: settings.execution_paused ?? false,
      executionPauseReason: settings.execution_pause_reason ?? null,
      executionPausedAt: settings.execution_paused_at ?? null,
      excludedSymbols: settings.excluded_symbols ?? [],
      sessions: settings.sessions,
      mode: settings.mode ?? DEFAULT_EXECUTION_MODE,
      notificationChannels: settings.notification_channels ?? {
        email: true,
        telegram: true,
        whatsapp: false,
      },
      notificationEvents: settings.notification_events ?? {
        newTradeOpened: true,
        tpHit: true,
        slHit: true,
        lowMargin: true,
        eaDisconnected: true,
        telegramDisconnected: true,
        executionFailed: true,
        dailySummary: false,
      },
    });
  }
}
