import { InternalServerErrorException } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

import { SIGNAL_INGESTION_QUEUE } from '@tradepilot/config';
import { SignalClassification, SignalDTO } from '@tradepilot/shared';
import { regexParseSignal, validateSignalBusinessRules } from '@tradepilot/trading';

import { DatabaseService } from '../database/database.service';
import { ExecutionService } from '../execution/execution.service';

import { AiParsingService } from './ai-parsing.service';
import { SignalIngestionJob } from './signal.types';

@Processor(SIGNAL_INGESTION_QUEUE)
export class SignalsProcessor extends WorkerHost {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly executionService: ExecutionService,
    private readonly aiParsingService: AiParsingService,
  ) {
    super();
  }

  async process(job: Job<SignalIngestionJob>): Promise<void> {
    const {
      signalId,
      rawMessage,
      rawMessageHash,
      sourceChannel,
      userId,
      classification,
    } = job.data;

    if ((classification as SignalClassification | undefined) === 'NOISE') {
      await this.updateSignal(signalId, {
        status: 'IGNORED',
      });
      await this.executionService.recordLog(
        userId,
        signalId,
        'IGNORED',
        'Message classified as noise and excluded from execution flow',
        {
          attempt: 0,
          details: {
            classification: 'NOISE',
          },
        },
      );
      return;
    }

    let parsedSignal: SignalDTO;

    try {
      parsedSignal =
        regexParseSignal(rawMessage, sourceChannel ?? undefined) ??
        (await this.aiParsingService.parseSignal(rawMessage, sourceChannel ?? undefined));

      await this.executionService.recordLog(
        userId,
        signalId,
        'PARSING_COMPLETED',
        `Signal parsed as ${parsedSignal.action} ${parsedSignal.symbol} using ${parsedSignal.parser}`,
        {
          attempt: 0,
          details: {
            parser: parsedSignal.parser,
            action: parsedSignal.action,
            symbol: parsedSignal.symbol,
          },
        },
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Signal parsing failed unexpectedly';

      await this.updateSignal(signalId, {
        status: 'PARSE_FAILED',
      });
      await this.executionService.recordLog(userId, signalId, 'PARSE_FAILED', message, {
        attempt: 0,
      });
      return;
    }

    await this.updateSignal(signalId, {
      parsed_data: parsedSignal,
      confidence: parsedSignal.confidence,
      classification: parsedSignal.action === 'OPEN' ? 'SIGNAL' : 'MANAGEMENT',
      status: 'PARSED',
    });

    try {
      parsedSignal = validateSignalBusinessRules(parsedSignal);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Signal validation failed unexpectedly';

      await this.updateSignal(signalId, {
        parsed_data: parsedSignal,
        confidence: parsedSignal.confidence,
        status: 'VALIDATION_FAILED',
      });
      await this.executionService.recordLog(userId, signalId, 'VALIDATION_FAILED', message, {
        attempt: 0,
        details: {
          action: parsedSignal.action,
          symbol: parsedSignal.symbol,
        },
      });
      return;
    }

    await this.updateSignal(signalId, {
      parsed_data: parsedSignal,
      confidence: parsedSignal.confidence,
      status: 'VALIDATED',
    });
    await this.executionService.recordLog(
      userId,
      signalId,
      'VALIDATION_COMPLETED',
      `Signal validation passed for ${parsedSignal.action} ${parsedSignal.symbol}`,
      {
        attempt: 0,
        details: {
          action: parsedSignal.action,
          symbol: parsedSignal.symbol,
        },
      },
    );

    await this.executionService.dispatchSignal({
      userId,
      signalId,
      rawMessageHash,
      signal: parsedSignal,
    });
  }

  private async updateSignal(signalId: string, payload: Record<string, unknown>) {
    const { error } = await this.databaseService
      .getClient()
      .from('signals')
      .update(payload)
      .eq('id', signalId);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }
  }
}
