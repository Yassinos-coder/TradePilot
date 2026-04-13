import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  EA_DISPATCH_ACK_PREFIX,
  EA_DISPATCH_CHANNEL,
} from '@tradepilot/config';
import {
  ExecutionLogDTO,
  ExecutionStatus,
  SignalStatus,
  executionLogSchema,
} from '@tradepilot/shared';

import { hashText } from '../common/utils/hash';
import { sleep } from '../common/utils/sleep';
import { DatabaseService } from '../database/database.service';
import { ExecutionLogRecord } from '../database/database.types';
import { EaGatewayService } from '../ea/ea-gateway.service';
import { RedisService } from '../redis/redis.service';
import { SettingsService } from '../settings/settings.service';

import { ExecutionGuardService } from './execution-guard.service';
import {
  DispatchAckMessage,
  DispatchEventMessage,
  DispatchSignalInput,
} from './execution.types';

@Injectable()
export class ExecutionService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly gateway: EaGatewayService,
    private readonly configService: ConfigService,
    private readonly settingsService: SettingsService,
    private readonly guardService: ExecutionGuardService,
    private readonly redisService: RedisService,
  ) {}

  async dispatchSignal(input: DispatchSignalInput): Promise<void> {
    const executionKey = hashText(`${input.userId}:${input.signalId}`);
    const alreadyDispatched = await this.hasSuccessfulDispatch(executionKey);

    if (alreadyDispatched) {
      await this.updateSignalStatus(input.signalId, 'DISPATCHED');
      return;
    }

    const settings = await this.settingsService.getSettings(input.userId);

    await this.recordLog(
      input.userId,
      input.signalId,
      'RECEIVED',
      'Signal validated and queued for execution checks',
      {
        executionKey,
        attempt: 0,
      },
    );

    if (settings.mode !== 'AUTO') {
      await this.updateSignalStatus(input.signalId, 'EXECUTION_REJECTED');
      await this.recordLog(
        input.userId,
        input.signalId,
        'EXECUTION_REJECTED',
        `Execution mode ${settings.mode} prevented live dispatch`,
        {
          executionKey,
          attempt: 0,
        },
      );
      return;
    }

    const guardResult = await this.guardService.evaluate({
      userId: input.userId,
      signalId: input.signalId,
      rawMessageHash: input.rawMessageHash,
      signal: input.signal,
      settings,
    });

    if (!guardResult.allowed) {
      await this.updateSignalStatus(input.signalId, 'EXECUTION_REJECTED');
      await this.recordLog(
        input.userId,
        input.signalId,
        'EXECUTION_REJECTED',
        guardResult.reason ?? 'Execution guard rejected the signal',
        {
          executionKey,
          attempt: 0,
        },
      );
      return;
    }

    const maxAttempts = this.configService.get<number>('DISPATCH_RETRY_COUNT') ?? 3;
    const baseDelayMs = this.configService.get<number>('DISPATCH_RETRY_DELAY_MS') ?? 750;
    let sawPresence = false;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const connectionState = await this.gateway.getConnectionState(input.userId);

      if (!connectionState.online) {
        if (attempt < maxAttempts) {
          await this.recordLog(
            input.userId,
            input.signalId,
            'RETRYING',
            `EA offline on attempt ${attempt}; retrying with backoff`,
            {
              executionKey,
              attempt,
            },
          );
          await sleep(baseDelayMs * 2 ** (attempt - 1));
          continue;
        }

        await this.updateSignalStatus(input.signalId, 'EA_OFFLINE');
        await this.recordLog(
          input.userId,
          input.signalId,
          'EA_OFFLINE',
          'No authenticated EA connection was available after all retries',
          {
            executionKey,
            attempt,
          },
        );
        return;
      }

      sawPresence = true;
      const acknowledged = await this.publishDispatchAndAwaitAck(
        input,
        executionKey,
        attempt,
      );

      if (acknowledged) {
        await this.updateSignalStatus(input.signalId, 'DISPATCHED');
        await this.recordLog(
          input.userId,
          input.signalId,
          'DISPATCHED',
          `Signal dispatched to EA on attempt ${attempt}`,
          {
            executionKey,
            attempt,
          },
        );
        return;
      }

      if (attempt < maxAttempts) {
        await this.recordLog(
          input.userId,
          input.signalId,
          'RETRYING',
          `Dispatch acknowledgement timed out on attempt ${attempt}; retrying`,
          {
            executionKey,
            attempt,
          },
        );
        await sleep(baseDelayMs * 2 ** (attempt - 1));
      }
    }

    await this.updateSignalStatus(
      input.signalId,
      sawPresence ? 'DISPATCH_TIMEOUT' : 'EA_OFFLINE',
    );
    await this.recordLog(
      input.userId,
      input.signalId,
      sawPresence ? 'DISPATCH_TIMEOUT' : 'EA_OFFLINE',
      sawPresence
        ? 'Dispatch acknowledgement timed out after all retries'
        : 'No authenticated EA connection was available after all retries',
      {
        executionKey,
        attempt: maxAttempts,
      },
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
    options?: {
      executionKey?: string;
      attempt?: number;
    },
  ) {
    const { data, error } = await this.databaseService
      .getClient()
      .from('execution_logs')
      .insert({
        user_id: userId,
        signal_id: signalId,
        execution_key: options?.executionKey ?? null,
        attempt: options?.attempt ?? 0,
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

  private async publishDispatchAndAwaitAck(
    input: DispatchSignalInput,
    executionKey: string,
    attempt: number,
  ): Promise<boolean> {
    const ackTimeoutMs =
      this.configService.get<number>('EA_DISPATCH_ACK_TIMEOUT_MS') ?? 2_000;
    const eventId = `${executionKey}:${attempt}:${Date.now()}`;
    const ackChannel = `${EA_DISPATCH_ACK_PREFIX}:${eventId}`;
    const ackPromise = this.redisService.waitForMessage(ackChannel, ackTimeoutMs);
    const event: DispatchEventMessage = {
      eventId,
      executionKey,
      signalId: input.signalId,
      userId: input.userId,
      signal: input.signal,
    };

    await this.redisService.publish(EA_DISPATCH_CHANNEL, JSON.stringify(event));

    const rawAck = await ackPromise;

    if (!rawAck) {
      return false;
    }

    const ack = JSON.parse(rawAck) as DispatchAckMessage;
    return ack.delivered;
  }

  private async hasSuccessfulDispatch(executionKey: string): Promise<boolean> {
    const { data, error } = await this.databaseService
      .getClient()
      .from('execution_logs')
      .select('id')
      .eq('execution_key', executionKey)
      .eq('status', 'DISPATCHED')
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return Boolean(data);
  }

  private async updateSignalStatus(signalId: string, status: SignalStatus): Promise<void> {
    const { error } = await this.databaseService
      .getClient()
      .from('signals')
      .update({ status })
      .eq('id', signalId);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }
  }

  private toExecutionLogDto(log: ExecutionLogRecord): ExecutionLogDTO {
    return executionLogSchema.parse({
      id: log.id,
      signalId: log.signal_id,
      executionKey: log.execution_key,
      attempt: log.attempt,
      status: log.status,
      message: log.message,
      createdAt: log.created_at,
    });
  }
}
