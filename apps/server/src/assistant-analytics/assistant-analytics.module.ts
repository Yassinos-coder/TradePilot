import { Module } from '@nestjs/common';

import { ExecutionModule } from '../execution/execution.module';

import { AssistantAnalyticsController } from './assistant-analytics.controller';

@Module({
  imports: [ExecutionModule],
  controllers: [AssistantAnalyticsController],
})
export class AssistantAnalyticsModule {}
