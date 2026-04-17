import {
  AccountStatusDTO,
  SettingsDTO,
  SignalDTO,
  WebSocketOutboundMessage,
} from '@tradepilot/shared';

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

export interface DispatchAccountCommand {
  accountId: string;
  accountName: string | null;
  requestedSymbol: string;
  resolvedSymbol: string;
  matchType: 'exact' | 'startsWith' | 'normalized';
  message: WebSocketOutboundMessage;
}

export interface DispatchEventMessage {
  eventId: string;
  executionKey: string;
  signalId: string;
  userId: string;
  commands: DispatchAccountCommand[];
}

export interface DispatchAckMessage {
  eventId: string;
  delivered: boolean;
  deliveredCount: number;
  deliveredAccountIds: string[];
  instanceId: string;
  userId: string;
}

export interface EaConnectionAccountState {
  accountId: string;
  accountName: string | null;
  latencyMs: number | null;
  lastSeenAt: string;
  accountStatus?: AccountStatusDTO | null;
}

export interface EaConnectionState {
  online: boolean;
  latencyMs: number | null;
  lastSeenAt: string | null;
  connectionCount: number;
  accounts: EaConnectionAccountState[];
}
