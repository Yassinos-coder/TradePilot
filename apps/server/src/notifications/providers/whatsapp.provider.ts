import { Injectable, Logger } from '@nestjs/common';

import { NotificationDeliveryPayload, NotificationProvider } from '../notification.types';

@Injectable()
export class WhatsAppProvider implements NotificationProvider {
  readonly channel = 'whatsapp' as const;
  private readonly logger = new Logger(WhatsAppProvider.name);

  isEnabled(): boolean {
    return false;
  }

  async send(payload: NotificationDeliveryPayload): Promise<void> {
    this.logger.log(
      `WhatsApp provider is stubbed for future integration. user=${payload.userId} event=${payload.event}`,
    );
  }
}
