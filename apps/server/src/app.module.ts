import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { parseServerEnv } from '@tradepilot/config';

import { AccountsModule } from './accounts/accounts.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { AssistantAnalyticsModule } from './assistant-analytics/assistant-analytics.module';
import { AuthModule } from './auth/auth.module';
import { CopierModule } from './copier/copier.module';
import { CotModule } from './cot/cot.module';
import { DatabaseModule } from './database/database.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { EaModule } from './ea/ea.module';
import { EaSharedModule } from './ea/ea-shared.module';
import { HealthController } from './health.controller';
import { NewsModule } from './news/news.module';
import { NotificationsModule } from './notifications/notifications.module';
import { RedisModule } from './redis/redis.module';
import { SettingsModule } from './settings/settings.module';
import { UsersModule } from './users/users.module';

@Module({
  controllers: [HealthController],
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env', '../../.env'],
      validate: (environment) => parseServerEnv(environment),
    }),
    RedisModule,
    DatabaseModule,
    UsersModule,
    ApiKeysModule,
    NotificationsModule,
    AuthModule,
    AccountsModule,
    SettingsModule,
    EaSharedModule,
    CopierModule,
    EaModule,
    AnalyticsModule,
    NewsModule,
    CotModule,
    DashboardModule,
    AssistantAnalyticsModule,
  ],
})
export class AppModule {}
