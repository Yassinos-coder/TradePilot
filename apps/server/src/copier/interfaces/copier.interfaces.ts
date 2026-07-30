import { CopyAction, OrderSide } from '@tradepilot/shared';

import {
  AccountRecord,
  AccountStatusSnapshotRecord,
  CopierLinkRecord,
} from '../../database/database.types';

/** A master trade event normalised into something the copier can fan out. */
export interface MasterEvent {
  userId: string;
  masterAccountId: string;
  masterExternalAccountId: string;
  masterTicket: string;
  action: CopyAction;
  symbol: string;
  baseSymbol: string;
  side: OrderSide | null;
  volume: number | null;
  entryPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  closePercent: number | null;
  masterEventAt: string;
}

export interface CopierGuardInput {
  link: CopierLinkRecord;
  event: MasterEvent;
  slaveAccount: AccountRecord;
  slaveStatus: AccountStatusSnapshotRecord | null;
  openPositionCount: number;
  netProfitToday: number;
}

export interface CopierGuardResult {
  allowed: boolean;
  reason?: string;
}

export interface SizingInput {
  link: CopierLinkRecord;
  masterVolume: number;
  masterStopLoss: number | null;
  masterEntryPrice: number | null;
  masterEquity: number | null;
  slaveEquity: number | null;
}

export interface SizingResult {
  volume: number;
  /** Set when the requested mode could not be applied and a fallback was used. */
  note: string | null;
}
