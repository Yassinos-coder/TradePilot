import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';

import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { EmailProvider } from './providers/email.provider';
import { TelegramProvider } from './providers/telegram.provider';
import { WhatsAppProvider } from './providers/whatsapp.provider';

@Module({
  imports: [DatabaseModule],
  providers: [NotificationsService, EmailProvider, TelegramProvider, WhatsAppProvider],
  controllers: [NotificationsController],
  exports: [NotificationsService],
})
export class NotificationsModule {}
