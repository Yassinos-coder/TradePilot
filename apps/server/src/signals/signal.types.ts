export interface SignalIngestionJob {
  signalId: string;
  userId: string;
  rawMessage: string;
  sourceChannel?: string;
}
