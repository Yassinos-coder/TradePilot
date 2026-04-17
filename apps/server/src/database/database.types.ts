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
  | 'PARSING_COMPLETED'
  | 'VALIDATION_FAILED'
  | 'VALIDATION_COMPLETED'
  | 'TELEGRAM_MESSAGE_RECEIVED'
  | 'SYMBOL_MAPPED'
  | 'SYMBOL_MAPPING_FAILED'
  | 'EA_OFFLINE'
  | 'DISPATCH_TIMEOUT'
  | 'EXECUTION_REJECTED'
  | 'ACCOUNT_STATUS_RECEIVED'
  | 'TRADE_OPENED'
  | 'TRADE_CLOSED'
  | 'TRADE_REJECTED'
  | 'COMMAND_SUCCEEDED'
  | 'COMMAND_FAILED';

export type TradeLifecycleStatus = 'OPEN' | 'CLOSED' | 'REJECTED';
export type AccountSource = 'MANUAL' | 'EA';

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
  external_account_id: string | null;
  name: string;
  broker: string | null;
  source: AccountSource;
  last_seen_at: string | null;
  latency_ms: number | null;
  created_at: string;
}

export interface SettingsRecord {
  id: string;
  user_id: string;
  risk_percent: number;
  max_trades: number;
  allowed_symbols: string[];
  excluded_symbols: string[];
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
  telegram_message_id: string | null;
  telegram_channel_id: string | null;
  message_timestamp: string | null;
  ingestion_source: 'MANUAL' | 'TELEGRAM_REALTIME' | 'TELEGRAM_BACKFILL';
  parsed_data: Record<string, unknown> | null;
  confidence: number | null;
  status: SignalStatus;
  created_at: string;
}

export interface ExecutionLogRecord {
  id: string;
  user_id: string;
  signal_id: string | null;
  account_id: string | null;
  account_name: string | null;
  execution_key: string | null;
  attempt: number;
  status: ExecutionStatus;
  message: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface TelegramChannelRecord {
  id: string;
  user_id: string;
  telegram_connection_id: string;
  external_id: string;
  name: string;
  username: string | null;
  kind: 'CHANNEL' | 'GROUP';
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export type TelegramConnectionStatus =
  | 'DISCONNECTED'
  | 'PENDING_CODE'
  | 'PENDING_PASSWORD'
  | 'CONNECTED'
  | 'ERROR';

export interface TelegramConnectionRecord {
  id: string;
  user_id: string;
  phone_number: string;
  session_ciphertext: string | null;
  status: TelegramConnectionStatus;
  phone_code_hash: string | null;
  telegram_user_id: string | null;
  username: string | null;
  display_name: string | null;
  last_error: string | null;
  last_connected_at: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AccountStatusSnapshotRecord {
  id: string;
  user_id: string;
  account_id: string;
  account_name: string | null;
  balance: number;
  equity: number;
  margin: number;
  free_margin: number;
  drawdown_percent: number;
  open_positions: number;
  created_at: string;
}

export interface TradeExecutionRecord {
  id: string;
  user_id: string;
  signal_id: string | null;
  account_id: string;
  account_name: string | null;
  ticket: string;
  symbol: string;
  type: 'BUY' | 'SELL';
  volume: number;
  entry_price: number;
  exit_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  profit: number;
  status: TradeLifecycleStatus;
  comment: string | null;
  opened_at: string;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserSymbolRecord {
  id: string;
  user_id: string;
  account_id: string;
  symbol: string;
  base_symbol: string;
  created_at: string;
  updated_at: string;
}
