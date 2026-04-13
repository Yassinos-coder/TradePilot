import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ExecutionLogDTO, SignalDTO, executionLogSchema } from '@tradepilot/shared';

import { sleep } from '../common/utils/sleep';
import { DatabaseService } from '../database/database.service';
import {
  ExecutionLogRecord,
  ExecutionStatus,
} from '../database/database.types';
import { EaGatewayService } from '../ea/ea-gateway.service';

@Injectable()
export class ExecutionService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly gateway: EaGatewayService,
    private readonly configService: ConfigService,
  ) {}

  async dispatchSignal(userId: string, signalId: string, signal: SignalDTO) {
    await this.recordLog(
      userId,
      signalId,
      'RECEIVED',
      'Signal validated and ready for live EA delivery',
    );

    const maxAttempts = this.configService.get<number>('DISPATCH_RETRY_COUNT') ?? 3;
    const retryDelayMs = this.configService.get<number>('DISPATCH_RETRY_DELAY_MS') ?? 750;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const delivered = await this.gateway.sendSignal(userId, signal);

      if (delivered) {
        const { error: signalError } = await this.databaseService
          .getClient()
          .from('signals')
          .update({ status: 'DISPATCHED' })
          .eq('id', signalId);

        if (signalError) {
          throw new InternalServerErrorException(signalError.message);
        }

        await this.recordLog(
          userId,
          signalId,
          'DISPATCHED',
          `Signal dispatched to the connected EA on attempt ${attempt}`,
        );

        return;
      }

      if (attempt < maxAttempts) {
        await this.recordLog(
          userId,
          signalId,
          'RETRIED',
          `No live EA connection was available, retry ${attempt} scheduled`,
        );

        await sleep(retryDelayMs * attempt);
      }
    }

    const { error: failedSignalError } = await this.databaseService
      .getClient()
      .from('signals')
      .update({ status: 'FAILED' })
      .eq('id', signalId);

    if (failedSignalError) {
      throw new InternalServerErrorException(failedSignalError.message);
    }

    await this.recordLog(
      userId,
      signalId,
      'FAILED',
      'Signal delivery failed because no authenticated EA connection was available',
    );
  }

  async listLogs(userId: string, limit = 10): Promise<ExecutionLogDTO[]> {
    const { data: logs, error } = await this.databaseService
      .getClient()
      .from('execution_logs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return (logs ?? []).map((log) => this.toExecutionLogDto(log as ExecutionLogRecord));
  }

  async recordLog(
    userId: string,
    signalId: string | null,
    status: ExecutionStatus,
    message: string,
  ) {
    const { data, error } = await this.databaseService
      .getClient()
      .from('execution_logs')
      .insert({
        user_id: userId,
        signal_id: signalId,
        status,
        message,
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new InternalServerErrorException(
        error?.message ?? 'Failed to record execution log',
      );
    }

    return data as ExecutionLogRecord;
  }

  private toExecutionLogDto(log: ExecutionLogRecord): ExecutionLogDTO {
    return executionLogSchema.parse({
      id: log.id,
      signalId: log.signal_id,
      status: log.status,
      message: log.message,
      createdAt: log.created_at,
    });
  }
}
