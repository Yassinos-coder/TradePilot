import { Module } from '@nestjs/common';

import { AccountsModule } from '../accounts/accounts.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { CopierModule } from '../copier/copier.module';
import { DatabaseModule } from '../database/database.module';
import { SettingsModule } from '../settings/settings.module';

import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [AccountsModule, AnalyticsModule, CopierModule, SettingsModule, DatabaseModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
