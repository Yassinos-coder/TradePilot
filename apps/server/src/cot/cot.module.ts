import { Module } from '@nestjs/common';

import { RedisModule } from '../redis/redis.module';

import { CotController } from './controllers/cot.controller';
import { CotBackfillProcessor } from './processors/cot-backfill.processor';
import { CotBackfillQueue } from './queues/cot-backfill.queue';
import { CotHistoryRepository } from './repositories/cot-history.repository';
import { CotBackfillService } from './services/cot-backfill.service';
import { CotFeedService } from './services/cot-feed.service';
import { CotHistoryService } from './services/cot-history.service';
import { CotSocrataService } from './services/cot-socrata.service';
import { CotService } from './services/cot.service';

@Module({
  imports: [RedisModule],
  controllers: [CotController],
  providers: [
    CotService,
    CotFeedService,
    CotHistoryService,
    CotBackfillService,
    CotSocrataService,
    CotHistoryRepository,
    CotBackfillQueue,
    CotBackfillProcessor,
  ],
})
export class CotModule {}
