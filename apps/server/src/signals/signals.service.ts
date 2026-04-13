import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

import { SIGNAL_INGESTION_QUEUE } from '@tradepilot/config';
import {
  SignalRecordDTO,
  signalDtoSchema,
  signalRecordSchema,
} from '@tradepilot/shared';

import { DatabaseService } from '../database/database.service';
import { SignalRecord } from '../database/database.types';

import { SignalIngestionJob } from './signal.types';

@Injectable()
export class SignalsService {
  constructor(
    private readonly databaseService: DatabaseService,
    @InjectQueue(SIGNAL_INGESTION_QUEUE) private readonly signalQueue: Queue<SignalIngestionJob>,
  ) {}

  async ingestRawSignal(
    userId: string,
    rawMessage: string,
    sourceChannel?: string,
  ): Promise<SignalRecordDTO> {
    const { data: signal, error } = await this.databaseService
      .getClient()
      .from('signals')
      .insert({
        user_id: userId,
        raw_message: rawMessage,
        source_channel: sourceChannel ?? null,
        status: 'PENDING',
      })
      .select('*')
      .single();

    if (error || !signal) {
      throw new InternalServerErrorException(
        error?.message ?? 'Failed to store the incoming signal',
      );
    }

    await this.signalQueue.add(
      'process-signal',
      {
        signalId: signal.id,
        userId,
        rawMessage,
        sourceChannel,
      },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    return this.toSignalRecordDto(signal as SignalRecord);
  }

  async listRecentSignals(userId: string, limit = 10): Promise<SignalRecordDTO[]> {
    const { data: signals, error } = await this.databaseService
      .getClient()
      .from('signals')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return (signals ?? []).map((signal) => this.toSignalRecordDto(signal as SignalRecord));
  }

  private toSignalRecordDto(signal: SignalRecord): SignalRecordDTO {
    const parsedData =
      signal.parsed_data && typeof signal.parsed_data === 'object'
        ? signalDtoSchema.parse(signal.parsed_data)
        : null;

    return signalRecordSchema.parse({
      id: signal.id,
      rawMessage: signal.raw_message,
      sourceChannel: signal.source_channel,
      parsedData,
      status: signal.status,
      createdAt: signal.created_at,
    });
  }
}
