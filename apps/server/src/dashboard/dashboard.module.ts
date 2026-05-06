import { Module } from '@nestjs/common';

import { AccountsModule } from '../accounts/accounts.module';
import { DatabaseModule } from '../database/database.module';
import { ExecutionModule } from '../execution/execution.module';
import { SettingsModule } from '../settings/settings.module';
import { SignalsModule } from '../signals/signals.module';

import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [AccountsModule, SignalsModule, ExecutionModule, SettingsModule, DatabaseModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
