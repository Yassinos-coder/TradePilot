import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { EaModule } from '../ea/ea.module';

import { AnalyticsController } from './controllers/analytics.controller';
import { AnalyticsService } from './services/analytics.service';
import { TradeHistoryImportService } from './services/trade-history-import.service';

@Module({
  imports: [DatabaseModule, EaModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, TradeHistoryImportService],
  exports: [AnalyticsService, TradeHistoryImportService],
})
export class AnalyticsModule {}
