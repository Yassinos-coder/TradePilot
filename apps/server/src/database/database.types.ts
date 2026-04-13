export type SignalStatus =
  | 'PENDING'
  | 'VALIDATED'
  | 'DISPATCHED'
  | 'PARSE_FAILED'
  | 'VALIDATION_FAILED'
  | 'EA_OFFLINE'
  | 'DISPATCH_TIMEOUT'
  | 'EXECUTION_REJECTED';

export type ExecutionStatus =
  | 'RECEIVED'
  | 'RETRYING'
  | 'DISPATCHED'
  | 'PARSE_FAILED'
  | 'VALIDATION_FAILED'
  | 'EA_OFFLINE'
  | 'DISPATCH_TIMEOUT'
  | 'EXECUTION_REJECTED';

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
  mode: 'AUTO' | 'SEMI_AUTO' | 'MANUAL';
  created_at: string;
  updated_at: string;
}

export interface SignalRecord {
  id: string;
  user_id: string;
  raw_message: string;
  raw_message_hash: string | null;
  source_channel: string | null;
  parsed_data: Record<string, unknown> | null;
  confidence: number | null;
  status: SignalStatus;
  created_at: string;
}

export interface ExecutionLogRecord {
  id: string;
  user_id: string;
  signal_id: string | null;
  execution_key: string | null;
  attempt: number;
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
