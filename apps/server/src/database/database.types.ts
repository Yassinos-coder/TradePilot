export type SignalStatus =
  | 'PENDING'
  | 'PARSED'
  | 'VALIDATED'
  | 'DISPATCHED'
  | 'EXECUTED'
  | 'PARSE_FAILED'
  | 'VALIDATION_FAILED'
  | 'EA_OFFLINE'
  | 'DISPATCH_TIMEOUT'
  | 'EXECUTION_REJECTED'
  | 'IGNORED'
  | 'BLOCKED'
  | 'AUTO_COPY_DISABLED'
  | 'SYMBOL_UNRESOLVED';

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
  | 'AUTO_COPY_DISABLED'
  | 'IGNORED'
  | 'BLOCKED'
  | 'RISK_LIMIT_HIT'
  | 'FAILSAFE_TRIGGERED'
  | 'ACCOUNT_STATUS_RECEIVED'
  | 'TRADE_OPENED'
  | 'TRADE_CLOSED'
  | 'TRADE_REJECTED'
  | 'COMMAND_SUCCEEDED'
  | 'COMMAND_FAILED';

export type TradeLifecycleStatus = 'OPEN' | 'CLOSED' | 'REJECTED';
export type AccountSource = 'MANUAL' | 'EA';
export type TradeHistoryFileStatus = 'UPLOADED' | 'PARSED' | 'FAILED';
export type TradeHistoryPlatform = 'MT4' | 'MT5' | 'GENERIC';
export type SignalClassification = 'SIGNAL' | 'MANAGEMENT' | 'NOISE';
export type PositionDirection = 'LONG' | 'SHORT';
export type CloseReason = 'TP' | 'SL' | 'MANUAL' | 'PARTIAL' | 'BREAKEVEN' | 'UNKNOWN';
export type CopierProgramStatus = 'ACTIVE' | 'PAUSED' | 'DISABLED';
export type FollowerDeviceStatus = 'PENDING_APPROVAL' | 'ACTIVE' | 'REVOKED';

export interface UserRecord {
  id: string;
  auth_user_id: string | null;
  email: string;
  password: string | null;
  api_key: string;
  full_name: string | null;
  phone_number: string | null;
  pending_email: string | null;
  pending_email_token: string | null;
  pending_email_requested_at: string | null;
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
  max_simultaneous_trades: number;
  max_daily_loss_percent: number;
  max_trades_per_day: number;
  low_margin_threshold_percent: number;
  auto_copy_enabled: boolean;
  execution_paused: boolean;
  execution_pause_reason: string | null;
  execution_paused_at: string | null;
  allowed_symbols: string[];
  excluded_symbols: string[];
  sessions: {
    london: boolean;
    newYork: boolean;
  };
  mode: 'AUTO' | 'SEMI_AUTO' | 'MANUAL';
  notification_channels: {
    email?: boolean;
    telegram?: boolean;
    whatsapp?: boolean;
  };
  notification_events: {
    newTradeOpened?: boolean;
    tpHit?: boolean;
    slHit?: boolean;
    lowMargin?: boolean;
    eaDisconnected?: boolean;
    telegramDisconnected?: boolean;
    executionFailed?: boolean;
    dailySummary?: boolean;
  };
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
  classification: SignalClassification;
  deleted_at: string | null;
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

export interface TradeHistoryFileRecord {
  id: string;
  user_id: string;
  display_name: string;
  original_filename: string;
  storage_bucket: string;
  storage_path: string;
  content_type: string | null;
  file_size: number;
  platform: TradeHistoryPlatform;
  parsed_trade_count: number;
  skipped_row_count: number;
  status: TradeHistoryFileStatus;
  created_at: string;
  updated_at: string;
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
  opening_order_type: 'BUY' | 'SELL' | null;
  position_direction: PositionDirection | null;
  close_reason: CloseReason | null;
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

export interface NotificationPreferencesRecord {
  id: string;
  user_id: string;
  email_enabled: boolean;
  telegram_enabled: boolean;
  whatsapp_enabled: boolean;
  notify_new_trade_opened: boolean;
  notify_tp_hit: boolean;
  notify_sl_hit: boolean;
  notify_low_margin: boolean;
  notify_ea_disconnected: boolean;
  notify_telegram_disconnected: boolean;
  notify_execution_failed: boolean;
  notify_daily_summary: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserSessionRecord {
  id: string;
  user_id: string;
  auth_session_id: string;
  user_agent: string | null;
  ip_address: string | null;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
}

export interface CopierProgramRecord {
  id: string;
  provider_user_id: string;
  name: string;
  description: string | null;
  status: CopierProgramStatus;
  max_follower_devices: number;
  requires_approval: boolean;
  created_at: string;
  updated_at: string;
}

export interface CopierInviteCodeRecord {
  id: string;
  program_id: string;
  code: string;
  active: boolean;
  expires_at: string | null;
  created_at: string;
}

export interface FollowerDeviceRecord {
  id: string;
  program_id: string;
  nickname: string | null;
  token_hash: string;
  account_login_hash: string;
  account_login_masked: string | null;
  broker_server: string | null;
  platform: 'MT4' | 'MT5' | null;
  terminal_fingerprint_hash: string;
  status: FollowerDeviceStatus;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}
