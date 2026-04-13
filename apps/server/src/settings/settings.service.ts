import { Injectable, InternalServerErrorException } from '@nestjs/common';

import { DEFAULT_ALLOWED_SYMBOLS, DEFAULT_SESSIONS } from '@tradepilot/config';
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
        allowed_symbols: DEFAULT_ALLOWED_SYMBOLS,
        sessions: DEFAULT_SESSIONS,
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
          allowed_symbols: payload.allowedSymbols,
          sessions: payload.sessions,
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

  private toSettingsDto(settings: SettingsRecord): SettingsDTO {
    return settingsDtoSchema.parse({
      riskPercent: settings.risk_percent,
      maxTrades: settings.max_trades,
      allowedSymbols: settings.allowed_symbols,
      sessions: settings.sessions,
    });
  }
}
