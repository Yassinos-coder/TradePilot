import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ShieldModule } from 'nestjs-shield';

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
import { NotificationsModule } from './notifications/notifications.module';
import { RedisModule } from './redis/redis.module';
import { RedisService } from './redis/redis.service';
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
    ShieldModule.forRootAsync({
      imports: [RedisModule],
      inject: [ConfigService, RedisService],
      useFactory: (...args: unknown[]) => {
        const [config, redis] = args as [ConfigService, RedisService];
        return {
        trustProxy: 1,
        storage: { type: 'redis', client: redis.getClient(), keyPrefix: 'shield:' },
        rateLimit: {
          algorithm: 'token-bucket',
          limit: config.get<number>('SHIELD_RATE_LIMIT') ?? 300,
          ttl: 60_000,
        },
        autoBan: { threshold: 20, window: 60_000, banDuration: 5 * 60_000, escalate: true },
        payload: { maxBodyBytes: 1_000_000 },
        };
      },
    }),
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
    CotModule,
    DashboardModule,
    AssistantAnalyticsModule,
  ],
})
export class AppModule {}
