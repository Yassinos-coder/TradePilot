import { Module } from '@nestjs/common';

import { AnalyticsModule } from '../analytics/analytics.module';

import { AssistantAnalyticsController } from './assistant-analytics.controller';

@Module({
  imports: [AnalyticsModule],
  controllers: [AssistantAnalyticsController],
})
export class AssistantAnalyticsModule {}
