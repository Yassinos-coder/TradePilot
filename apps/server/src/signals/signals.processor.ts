import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InternalServerErrorException } from '@nestjs/common';

import { SIGNAL_INGESTION_QUEUE } from '@tradepilot/config';
import { mockAiParseSignal, validateSignalBusinessRules } from '@tradepilot/trading';

import { DatabaseService } from '../database/database.service';
import { ExecutionService } from '../execution/execution.service';

import { SignalIngestionJob } from './signal.types';

@Processor(SIGNAL_INGESTION_QUEUE)
export class SignalsProcessor extends WorkerHost {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly executionService: ExecutionService,
  ) {
    super();
  }

  async process(job: Job<SignalIngestionJob>): Promise<void> {
    const { signalId, rawMessage, sourceChannel, userId } = job.data;

    try {
      const parsedSignal = validateSignalBusinessRules(
        mockAiParseSignal(rawMessage, sourceChannel),
      );

      const { error: updateError } = await this.databaseService
        .getClient()
        .from('signals')
        .update({
          parsed_data: parsedSignal,
          status: 'VALIDATED',
        })
        .eq('id', signalId);

      if (updateError) {
        throw new InternalServerErrorException(updateError.message);
      }

      await this.executionService.dispatchSignal(userId, signalId, parsedSignal);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Signal processing failed unexpectedly';

      await this.databaseService
        .getClient()
        .from('signals')
        .update({ status: 'FAILED' })
        .eq('id', signalId);

      await this.executionService.recordLog(userId, signalId, 'FAILED', message);
      throw error;
    }
  }
}
