import { Injectable, InternalServerErrorException } from '@nestjs/common';

import {
  DEFAULT_ALLOW_API_TRADE_OPENING,
  DEFAULT_AUTO_COPY_ENABLED,
  DEFAULT_COPIER_RISK_PARAMS,
  DEFAULT_EXCLUDED_SYMBOLS,
  DEFAULT_NOTIFICATION_CHANNELS,
  DEFAULT_NOTIFICATION_EVENTS,
  DEFAULT_SESSIONS,
} from '@tradepilot/config';
import { SettingsDTO, copierRiskParamsSchema, settingsDtoSchema } from '@tradepilot/shared';

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
        auto_copy_enabled: DEFAULT_AUTO_COPY_ENABLED,
        execution_paused: false,
        execution_pause_reason: null,
        execution_paused_at: null,
        allow_api_trade_opening: DEFAULT_ALLOW_API_TRADE_OPENING,
        excluded_symbols: DEFAULT_EXCLUDED_SYMBOLS,
        sessions: DEFAULT_SESSIONS,
        copier_defaults: DEFAULT_COPIER_RISK_PARAMS,
        notification_channels: DEFAULT_NOTIFICATION_CHANNELS,
        notification_events: DEFAULT_NOTIFICATION_EVENTS,
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
          auto_copy_enabled: payload.autoCopyEnabled,
          execution_paused: payload.executionPaused,
          execution_pause_reason: payload.executionPauseReason,
          execution_paused_at: payload.executionPausedAt,
          allow_api_trade_opening: payload.allowApiTradeOpening,
          excluded_symbols: payload.excludedSymbols,
          sessions: payload.sessions,
          copier_defaults: payload.copierDefaults,
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

  /** The global copier kill switch. Disabling also pauses execution. */
  async updateAutoCopy(userId: string, enabled: boolean): Promise<SettingsDTO> {
    await this.getSettings(userId);

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

  async updateAllowApiTradeOpening(userId: string, allowed: boolean): Promise<SettingsDTO> {
    await this.getSettings(userId);

    const { data, error } = await this.databaseService
      .getClient()
      .from('settings')
      .update({ allow_api_trade_opening: allowed })
      .eq('user_id', userId)
      .select('*')
      .single();

    if (error || !data) {
      throw new InternalServerErrorException(
        error?.message ?? 'Failed to update API trade opening setting',
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
        auto_copy_enabled: !paused,
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
      autoCopyEnabled: settings.auto_copy_enabled ?? DEFAULT_AUTO_COPY_ENABLED,
      executionPaused: settings.execution_paused ?? false,
      executionPauseReason: settings.execution_pause_reason ?? null,
      executionPausedAt: settings.execution_paused_at ?? null,
      allowApiTradeOpening:
        settings.allow_api_trade_opening ?? DEFAULT_ALLOW_API_TRADE_OPENING,
      excludedSymbols: settings.excluded_symbols ?? DEFAULT_EXCLUDED_SYMBOLS,
      sessions: settings.sessions ?? DEFAULT_SESSIONS,
      // Older rows may hold a partial object; the schema fills the rest in.
      copierDefaults: copierRiskParamsSchema.parse(settings.copier_defaults ?? {}),
      notificationChannels: {
        ...DEFAULT_NOTIFICATION_CHANNELS,
        ...(settings.notification_channels ?? {}),
      },
      notificationEvents: {
        ...DEFAULT_NOTIFICATION_EVENTS,
        ...(settings.notification_events ?? {}),
      },
    });
  }
}
