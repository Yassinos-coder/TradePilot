import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { NotificationDeliveryPayload, NotificationProvider } from '../notification.types';

@Injectable()
export class TelegramProvider implements NotificationProvider {
  readonly channel = 'telegram' as const;
  private readonly logger = new Logger(TelegramProvider.name);

  constructor(private readonly configService: ConfigService) {}

  isEnabled(): boolean {
    return Boolean(this.configService.get<string>('TELEGRAM_BOT_TOKEN'));
  }

  async send(payload: NotificationDeliveryPayload): Promise<void> {
    if (!this.isEnabled()) {
      this.logger.log(
        `Telegram notification skipped (bot token missing). user=${payload.userId} event=${payload.event}`,
      );
      return;
    }

    // The plumbing is in place; delivery routing can be finalized once user bot chat IDs are captured.
    this.logger.log(
      `Telegram notification queued for user=${payload.userId} event=${payload.event} title="${payload.title}"`,
    );
  }
}
