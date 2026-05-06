import { SignalClassification, SignalIngestionSource } from '@tradepilot/shared';

export interface SignalIngestionJob {
  signalId: string;
  userId: string;
  rawMessage: string;
  rawMessageHash: string;
  sourceChannel?: string | null;
  telegramMessageId?: string | null;
  telegramChannelId?: string | null;
  messageTimestamp?: string | null;
  ingestionSource?: SignalIngestionSource;
  classification?: SignalClassification;
}
