import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';

import { NotificationsController } from './notifications.controller';
import { NotificationDispatcherService } from './notification-dispatcher.service';
import { NotificationEventBusService } from './notification-event-bus.service';
import { NotificationsService } from './notifications.service';
import { EmailProvider } from './providers/email.provider';
import { WhatsAppProvider } from './providers/whatsapp.provider';

@Module({
  imports: [DatabaseModule],
  providers: [
    NotificationsService,
    NotificationEventBusService,
    NotificationDispatcherService,
    EmailProvider,
    WhatsAppProvider,
  ],
  controllers: [NotificationsController],
  exports: [NotificationsService, NotificationEventBusService],
})
export class NotificationsModule {}
