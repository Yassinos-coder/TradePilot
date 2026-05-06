export const NOTIFICATION_EVENT_KEYS = [
  'newTradeOpened',
  'tpHit',
  'slHit',
  'lowMargin',
  'eaDisconnected',
  'telegramDisconnected',
  'executionFailed',
  'dailySummary',
] as const;

export type NotificationEventKey = (typeof NOTIFICATION_EVENT_KEYS)[number];

export interface NotificationChannels {
  email: boolean;
  telegram: boolean;
  whatsapp: boolean;
}

export interface NotificationEvents {
  newTradeOpened: boolean;
  tpHit: boolean;
  slHit: boolean;
  lowMargin: boolean;
  eaDisconnected: boolean;
  telegramDisconnected: boolean;
  executionFailed: boolean;
  dailySummary: boolean;
}

export interface NotificationDispatchInput {
  userId: string;
  event: NotificationEventKey;
  title: string;
  body: string;
  html?: string;
  metadata?: Record<string, unknown> | null;
}

export interface NotificationDeliveryPayload {
  userId: string;
  email: string | null;
  event: NotificationEventKey;
  title: string;
  body: string;
  html?: string;
  metadata?: Record<string, unknown> | null;
}

export interface NotificationProvider {
  readonly channel: 'email' | 'telegram' | 'whatsapp';
  isEnabled(): boolean;
  send(payload: NotificationDeliveryPayload): Promise<void>;
}
