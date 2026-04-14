import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { SIGNAL_INGESTION_QUEUE } from '@tradepilot/config';

import { ExecutionModule } from '../execution/execution.module';

import { AiParsingService } from './ai-parsing.service';
import { SignalsController } from './signals.controller';
import { SignalsProcessor } from './signals.processor';
import { SignalsService } from './signals.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: SIGNAL_INGESTION_QUEUE,
    }),
    ExecutionModule,
  ],
  controllers: [SignalsController],
  providers: [SignalsService, SignalsProcessor, AiParsingService],
  exports: [SignalsService],
})
export class SignalsModule {}
