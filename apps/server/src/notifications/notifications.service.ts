import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  NotificationPreferencesDTO,
  notificationPreferencesSchema,
} from '@tradepilot/shared';

import { DatabaseService } from '../database/database.service';
import { NotificationPreferencesRecord, UserRecord } from '../database/database.types';

import {
  buildAlertTemplate,
  buildEmailChangeVerificationTemplate,
  buildPasswordResetTemplate,
} from './email-templates';
import {
  NotificationDispatchInput,
  NotificationEventKey,
  NotificationEvents,
  NotificationProvider,
} from './notification.types';
import { EmailProvider } from './providers/email.provider';
import { WhatsAppProvider } from './providers/whatsapp.provider';

const DEFAULT_PREFERENCES: NotificationPreferencesDTO = {
  channels: {
    email: true,
    whatsapp: false,
  },
  events: {
    newTradeOpened: true,
    tpHit: true,
    slHit: true,
    lowMargin: true,
    eaDisconnected: true,
    masterOffline: true,
    copyFailed: true,
    executionFailed: true,
    dailySummary: false,
  },
};

@Injectable()
export class NotificationsService {
  private readonly providers: NotificationProvider[];

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly configService: ConfigService,
    emailProvider: EmailProvider,
    whatsappProvider: WhatsAppProvider,
  ) {
    this.providers = [emailProvider, whatsappProvider];
  }

  async getPreferences(userId: string): Promise<NotificationPreferencesDTO> {
    const record = await this.ensurePreferenceRow(userId);
    return this.toPreferencesDto(record);
  }

  async updatePreferences(
    userId: string,
    payload: NotificationPreferencesDTO,
  ): Promise<NotificationPreferencesDTO> {
    const parsed = notificationPreferencesSchema.parse(payload);

    const { data, error } = await this.databaseService
      .getClient()
      .from('notification_preferences')
      .upsert(
        {
          user_id: userId,
          email_enabled: parsed.channels.email,
          whatsapp_enabled: parsed.channels.whatsapp,
          notify_new_trade_opened: parsed.events.newTradeOpened,
          notify_tp_hit: parsed.events.tpHit,
          notify_sl_hit: parsed.events.slHit,
          notify_low_margin: parsed.events.lowMargin,
          notify_ea_disconnected: parsed.events.eaDisconnected,
          notify_master_offline: parsed.events.masterOffline,
          notify_copy_failed: parsed.events.copyFailed,
          notify_execution_failed: parsed.events.executionFailed,
          notify_daily_summary: parsed.events.dailySummary,
        },
        { onConflict: 'user_id' },
      )
      .select('*')
      .single();

    if (error || !data) {
      throw new InternalServerErrorException(
        error?.message ?? 'Failed to update notification preferences',
      );
    }

    return this.toPreferencesDto(data as NotificationPreferencesRecord);
  }

  async notify(input: NotificationDispatchInput): Promise<void> {
    const [user, preferences] = await Promise.all([
      this.getUser(input.userId),
      this.getPreferences(input.userId),
    ]);

    const eventEnabled = this.isEventEnabled(preferences.events, input.event);
    if (!eventEnabled) {
      return;
    }

    for (const provider of this.providers) {
      if (!provider.isEnabled()) {
        continue;
      }

      if (!preferences.channels[provider.channel]) {
        continue;
      }

      await provider.send({
        userId: input.userId,
        email: user.email,
        event: input.event,
        title: input.title,
        body: input.body,
        html: input.html,
        metadata: input.metadata ?? null,
      });
    }
  }

  async sendEmailChangeVerification(
    userId: string,
    toEmail: string,
    token: string,
  ): Promise<void> {
    const provider = this.providers.find((entry) => entry.channel === 'email');
    if (!provider) {
      return;
    }

    const appUrl = this.configService.get<string>('PUBLIC_APP_URL') ?? 'http://localhost:8080';
    const verifyUrl = `${appUrl.replace(/\/+$/, '')}/app/settings?tab=profile&emailToken=${encodeURIComponent(token)}`;
    const html = buildEmailChangeVerificationTemplate(verifyUrl);

    await provider.send({
      userId,
      email: toEmail,
      event: 'dailySummary',
      title: 'Confirm your new TradePilot email',
      body: `Confirm your new email address by opening this link: ${verifyUrl}`,
      html,
      metadata: {
        verificationUrl: verifyUrl,
      },
    });
  }

  async sendPasswordResetEmail(userId: string, toEmail: string, resetUrl: string): Promise<void> {
    const provider = this.providers.find((entry) => entry.channel === 'email');
    if (!provider) {
      return;
    }

    await provider.send({
      userId,
      email: toEmail,
      event: 'executionFailed',
      title: 'TradePilot password reset',
      body: `Reset your password by opening this secure link: ${resetUrl}`,
      html: buildPasswordResetTemplate(resetUrl),
      metadata: {
        resetUrl,
      },
    });
  }

  async sendAlertEmail(userId: string, title: string, message: string): Promise<void> {
    const user = await this.getUser(userId);
    const provider = this.providers.find((entry) => entry.channel === 'email');
    if (!provider) {
      return;
    }

    await provider.send({
      userId,
      email: user.email,
      event: 'executionFailed',
      title,
      body: message,
      html: buildAlertTemplate(title, message),
      metadata: null,
    });
  }

  private async ensurePreferenceRow(userId: string): Promise<NotificationPreferencesRecord> {
    const { data, error } = await this.databaseService
      .getClient()
      .from('notification_preferences')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    if (data) {
      return data as NotificationPreferencesRecord;
    }

    const { data: created, error: createError } = await this.databaseService
      .getClient()
      .from('notification_preferences')
      .insert({
        user_id: userId,
        email_enabled: DEFAULT_PREFERENCES.channels.email,
        whatsapp_enabled: DEFAULT_PREFERENCES.channels.whatsapp,
        notify_new_trade_opened: DEFAULT_PREFERENCES.events.newTradeOpened,
        notify_tp_hit: DEFAULT_PREFERENCES.events.tpHit,
        notify_sl_hit: DEFAULT_PREFERENCES.events.slHit,
        notify_low_margin: DEFAULT_PREFERENCES.events.lowMargin,
        notify_ea_disconnected: DEFAULT_PREFERENCES.events.eaDisconnected,
        notify_master_offline: DEFAULT_PREFERENCES.events.masterOffline,
        notify_copy_failed: DEFAULT_PREFERENCES.events.copyFailed,
        notify_execution_failed: DEFAULT_PREFERENCES.events.executionFailed,
        notify_daily_summary: DEFAULT_PREFERENCES.events.dailySummary,
      })
      .select('*')
      .single();

    if (createError || !created) {
      throw new InternalServerErrorException(
        createError?.message ?? 'Failed to initialize notification preferences',
      );
    }

    return created as NotificationPreferencesRecord;
  }

  private async getUser(userId: string): Promise<UserRecord> {
    const { data, error } = await this.databaseService
      .getClient()
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !data) {
      throw new InternalServerErrorException(
        error?.message ?? 'Failed to resolve notification recipient',
      );
    }

    return data as UserRecord;
  }

  private isEventEnabled(events: NotificationEvents, key: NotificationEventKey): boolean {
    return Boolean(events[key]);
  }

  private toPreferencesDto(
    record: NotificationPreferencesRecord,
  ): NotificationPreferencesDTO {
    return notificationPreferencesSchema.parse({
      channels: {
        email: record.email_enabled,
        whatsapp: record.whatsapp_enabled,
      },
      events: {
        newTradeOpened: record.notify_new_trade_opened,
        tpHit: record.notify_tp_hit,
        slHit: record.notify_sl_hit,
        lowMargin: record.notify_low_margin,
        eaDisconnected: record.notify_ea_disconnected,
        masterOffline: record.notify_master_offline,
        copyFailed: record.notify_copy_failed,
        executionFailed: record.notify_execution_failed,
        dailySummary: record.notify_daily_summary,
      },
    });
  }
}
