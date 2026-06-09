import { Module } from '@nestjs/common';

import { EaModule } from '../ea/ea.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SettingsModule } from '../settings/settings.module';

import { ExecutionController } from './execution.controller';
import { ExecutionGuardService } from './execution-guard.service';
import { ExecutionService } from './execution.service';
import { TradeHistoryImportService } from './trade-history-import.service';

@Module({
  imports: [EaModule, SettingsModule, NotificationsModule],
  controllers: [ExecutionController],
  providers: [ExecutionGuardService, ExecutionService, TradeHistoryImportService],
  exports: [ExecutionService, TradeHistoryImportService],
})
export class ExecutionModule {}
