import { Module } from '@nestjs/common';

import { EaModule } from '../ea/ea.module';
import { ExecutionModule } from '../execution/execution.module';
import { SignalsModule } from '../signals/signals.module';

import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [EaModule, SignalsModule, ExecutionModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
