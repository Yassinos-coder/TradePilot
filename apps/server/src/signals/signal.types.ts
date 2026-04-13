export interface SignalIngestionJob {
  signalId: string;
  userId: string;
  rawMessage: string;
  rawMessageHash: string;
  sourceChannel?: string;
}
