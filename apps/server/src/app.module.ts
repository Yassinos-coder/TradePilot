import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { parseServerEnv } from '@tradepilot/config';

import { AccountsModule } from './accounts/accounts.module';
import { AuthModule } from './auth/auth.module';
import { redisConnectionFromUrl } from './common/utils/redis';
import { DatabaseModule } from './database/database.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { EaModule } from './ea/ea.module';
import { ExecutionModule } from './execution/execution.module';
import { HealthController } from './health.controller';
import { RedisModule } from './redis/redis.module';
import { SettingsModule } from './settings/settings.module';
import { SignalsModule } from './signals/signals.module';
import { TelegramModule } from './telegram/telegram.module';
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
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: redisConnectionFromUrl(
          configService.getOrThrow<string>('REDIS_URL'),
        ),
      }),
    }),
    RedisModule,
    DatabaseModule,
    UsersModule,
    AuthModule,
    AccountsModule,
    SettingsModule,
    SignalsModule,
    TelegramModule,
    EaModule,
    ExecutionModule,
    DashboardModule,
  ],
})
export class AppModule {}
