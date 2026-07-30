import { Module } from '@nestjs/common';

import { RedisModule } from '../redis/redis.module';

import { DispatchIntentService } from './services/dispatch-intent.service';
import { EaPresenceService } from './services/ea-presence.service';

/**
 * State the copier and the gateway both need, split out so neither has to import
 * the other — the gateway depends on the copier, so the dependency can only run
 * one way.
 */
@Module({
  imports: [RedisModule],
  providers: [EaPresenceService, DispatchIntentService],
  exports: [EaPresenceService, DispatchIntentService],
})
export class EaSharedModule {}
