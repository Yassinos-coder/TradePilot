import { Module } from '@nestjs/common';

import { ApiKeysModule } from '../api-keys/api-keys.module';
import { DatabaseModule } from '../database/database.module';
import { EaSharedModule } from '../ea/ea-shared.module';
import { RedisModule } from '../redis/redis.module';
import { SettingsModule } from '../settings/settings.module';

import { CopierController } from './controllers/copier.controller';
import { TradeApiController } from './controllers/trade-api.controller';
import { CopierLinkRepository } from './repositories/copier-link.repository';
import { CopyEventRepository } from './repositories/copy-event.repository';
import { CopyOrderRepository } from './repositories/copy-order.repository';
import { CopierGuardService } from './services/copier-guard.service';
import { CopierLinksService } from './services/copier-links.service';
import { CopierService } from './services/copier.service';
import { TradeCommandService } from './services/trade-command.service';

@Module({
  imports: [DatabaseModule, RedisModule, SettingsModule, ApiKeysModule, EaSharedModule],
  controllers: [CopierController, TradeApiController],
  providers: [
    CopierService,
    CopierLinksService,
    CopierGuardService,
    TradeCommandService,
    CopierLinkRepository,
    CopyEventRepository,
    CopyOrderRepository,
  ],
  exports: [CopierService, CopierLinksService],
})
export class CopierModule {}
