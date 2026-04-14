import { AccountStatusDTO, EaTradePayload, SettingsDTO, SignalDTO } from '@tradepilot/shared';

export interface DispatchSignalInput {
  userId: string;
  signalId: string;
  rawMessageHash: string;
  signal: SignalDTO;
}

export interface ExecutionGuardInput {
  userId: string;
  signalId: string;
  rawMessageHash: string;
  signal: SignalDTO;
  settings: SettingsDTO;
}

export interface ExecutionGuardResult {
  allowed: boolean;
  reason?: string;
}

export interface DispatchEventMessage {
  eventId: string;
  executionKey: string;
  signalId: string;
  userId: string;
  trades: EaTradePayload[];
}

export interface DispatchAckMessage {
  eventId: string;
  delivered: boolean;
  deliveredCount: number;
  instanceId: string;
  userId: string;
}

export interface EaConnectionState {
  online: boolean;
  latencyMs: number | null;
  lastSeenAt: string | null;
  connectionCount: number;
  accountStatus?: AccountStatusDTO | null;
}
