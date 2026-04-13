import { Module } from '@nestjs/common';

import { SignalsModule } from '../signals/signals.module';

import { TelegramController } from './telegram.controller';
import { TelegramService } from './telegram.service';

@Module({
  imports: [SignalsModule],
  controllers: [TelegramController],
  providers: [TelegramService],
})
export class TelegramModule {}
