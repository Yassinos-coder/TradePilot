export type SignalStatus = 'PENDING' | 'VALIDATED' | 'DISPATCHED' | 'FAILED';
export type ExecutionStatus = 'RECEIVED' | 'DISPATCHED' | 'RETRIED' | 'FAILED';

export interface UserRecord {
  id: string;
  auth_user_id: string | null;
  email: string;
  password: string | null;
  api_key: string;
  created_at: string;
}

export interface AccountRecord {
  id: string;
  user_id: string;
  name: string;
  broker: string;
  created_at: string;
}

export interface SettingsRecord {
  id: string;
  user_id: string;
  risk_percent: number;
  max_trades: number;
  allowed_symbols: string[];
  sessions: {
    london: boolean;
    newYork: boolean;
  };
  created_at: string;
  updated_at: string;
}

export interface SignalRecord {
  id: string;
  user_id: string;
  raw_message: string;
  source_channel: string | null;
  parsed_data: Record<string, unknown> | null;
  status: SignalStatus;
  created_at: string;
}

export interface ExecutionLogRecord {
  id: string;
  user_id: string;
  signal_id: string | null;
  status: ExecutionStatus;
  message: string;
  created_at: string;
}

export interface TelegramChannelRecord {
  id: string;
  user_id: string;
  external_id: string;
  name: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}
