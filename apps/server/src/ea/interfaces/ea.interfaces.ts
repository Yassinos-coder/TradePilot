import { AccountStatusDTO, WebSocketOutboundMessage } from '@tradepilot/shared';

export interface DispatchAccountCommand {
  accountId: string;
  accountName: string | null;
  requestedSymbol: string;
  resolvedSymbol: string;
  message: WebSocketOutboundMessage;
}

export interface DispatchEventMessage {
  eventId: string;
  executionKey: string;
  copyEventId: string | null;
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
