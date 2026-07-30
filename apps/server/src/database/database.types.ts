export type ExecutionStatus =
  | 'RECEIVED'
  | 'RETRYING'
  | 'DISPATCHED'
  | 'COPY_SENT'
  | 'COPY_SKIPPED'
  | 'COPY_FILLED'
  | 'COPY_REJECTED'
  | 'SYMBOL_MAPPED'
  | 'SYMBOL_MAPPING_FAILED'
  | 'EA_OFFLINE'
  | 'MASTER_OFFLINE'
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
  | 'COMMAND_FAILED'
  | 'API_TRADE_REQUESTED'
  | 'API_TRADE_BLOCKED';

export type TradeLifecycleStatus = 'OPEN' | 'CLOSED' | 'REJECTED';
export type AccountSource = 'MANUAL' | 'EA';
export type AccountRole = 'MASTER' | 'SLAVE' | 'UNASSIGNED';
export type Platform = 'MT4' | 'MT5';
export type TradeHistoryFileStatus = 'UPLOADED' | 'PARSED' | 'FAILED';
export type TradeHistoryPlatform = 'MT4' | 'MT5' | 'GENERIC';
export type PositionDirection = 'LONG' | 'SHORT';
export type CloseReason = 'TP' | 'SL' | 'MANUAL' | 'PARTIAL' | 'BREAKEVEN' | 'UNKNOWN';

export type ApiKeyKind = 'EA' | 'REST';
export type SizingMode = 'FIXED_LOT' | 'MULTIPLIER' | 'RISK_PERCENT' | 'BALANCE_RATIO';
export type SymbolFilterMode = 'ALL' | 'ALLOWLIST' | 'BLOCKLIST';
export type CopyAction = 'OPEN' | 'CLOSE' | 'PARTIAL_CLOSE' | 'MODIFY';
export type CopyOrderStatus =
  | 'PENDING'
  | 'SENT'
  | 'FILLED'
  | 'SKIPPED'
  | 'REJECTED'
  | 'FAILED';

export interface UserRecord {
  id: string;
  auth_user_id: string | null;
  email: string;
  password: string | null;
  full_name: string | null;
  nickname: string | null;
  phone_number: string | null;
  country: string | null;
  city: string | null;
  street: string | null;
  postal_code: string | null;
  pending_email: string | null;
  pending_email_token: string | null;
  pending_email_requested_at: string | null;
  created_at: string;
}

export interface ApiKeyRecord {
  id: string;
  user_id: string;
  kind: ApiKeyKind;
  name: string;
  prefix: string;
  key_hash: string;
  scopes: string[];
  hmac_secret: string | null;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  rotated_from_id: string | null;
  created_at: string;
}

export interface AccountRecord {
  id: string;
  user_id: string;
  external_account_id: string | null;
  name: string;
  display_name: string | null;
  broker: string | null;
  source: AccountSource;
  role: AccountRole;
  platform: Platform | null;
  account_login: string | null;
  currency: string | null;
  leverage: number | null;
  last_seen_at: string | null;
  latency_ms: number | null;
  created_at: string;
}

export interface SettingsRecord {
  id: string;
  user_id: string;
  auto_copy_enabled: boolean;
  execution_paused: boolean;
  execution_pause_reason: string | null;
  execution_paused_at: string | null;
  allow_api_trade_opening: boolean;
  excluded_symbols: string[];
  sessions: {
    london: boolean;
    newYork: boolean;
  };
  copier_defaults: Record<string, unknown>;
  notification_channels: {
    email?: boolean;
    whatsapp?: boolean;
  };
  notification_events: {
    newTradeOpened?: boolean;
    tpHit?: boolean;
    slHit?: boolean;
    lowMargin?: boolean;
    eaDisconnected?: boolean;
    masterOffline?: boolean;
    copyFailed?: boolean;
    executionFailed?: boolean;
    dailySummary?: boolean;
  };
  created_at: string;
  updated_at: string;
}

export interface CopierLinkRecord {
  id: string;
  user_id: string;
  master_account_id: string;
  slave_account_id: string;
  enabled: boolean;

  sizing_mode: SizingMode;
  fixed_lot: number | null;
  lot_multiplier: number;
  risk_percent: number | null;
  min_lot: number;
  max_lot: number;

  max_open_positions: number;
  max_daily_loss_percent: number;
  max_drawdown_percent: number;
  equity_floor: number | null;
  max_spread_points: number | null;
  max_slippage_points: number;
  max_copy_delay_ms: number;

  copy_stop_loss: boolean;
  copy_take_profit: boolean;
  copy_modifications: boolean;
  copy_partial_closes: boolean;
  copy_closes: boolean;
  reverse_copy: boolean;

  symbol_filter_mode: SymbolFilterMode;
  symbol_filter: string[];
  symbol_prefix: string | null;
  symbol_suffix: string | null;

  created_at: string;
  updated_at: string;
}

export interface CopyEventRecord {
  id: string;
  user_id: string;
  master_account_id: string;
  master_ticket: string;
  action: CopyAction;
  symbol: string;
  base_symbol: string;
  side: 'BUY' | 'SELL' | null;
  volume: number | null;
  entry_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  close_percent: number | null;
  master_event_at: string;
  created_at: string;
}

export interface CopyOrderRecord {
  id: string;
  user_id: string;
  copy_event_id: string;
  copier_link_id: string;
  slave_account_id: string;
  master_ticket: string;
  slave_ticket: string | null;
  requested_symbol: string;
  resolved_symbol: string | null;
  side: 'BUY' | 'SELL' | null;
  requested_volume: number | null;
  filled_volume: number | null;
  status: CopyOrderStatus;
  skip_reason: string | null;
  execution_key: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExecutionLogRecord {
  id: string;
  user_id: string;
  copy_event_id: string | null;
  account_id: string | null;
  account_name: string | null;
  execution_key: string | null;
  attempt: number;
  status: ExecutionStatus;
  message: string;
  details: Record<string, unknown> | null;
  created_at: string;
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
  account_id: string;
  parsed_trade_count: number;
  skipped_row_count: number;
  status: TradeHistoryFileStatus;
  created_at: string;
  updated_at: string;
}

export interface TradeExecutionRecord {
  id: string;
  user_id: string;
  copy_event_id: string | null;
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
  entry_type: 'MARKET' | 'LIMIT' | 'STOP' | 'STOP_LIMIT';
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
  whatsapp_enabled: boolean;
  notify_new_trade_opened: boolean;
  notify_tp_hit: boolean;
  notify_sl_hit: boolean;
  notify_low_margin: boolean;
  notify_ea_disconnected: boolean;
  notify_master_offline: boolean;
  notify_copy_failed: boolean;
  notify_execution_failed: boolean;
  notify_daily_summary: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserSessionRecord {
  id: string;
  user_id: string;
  auth_session_id: string;
  device_id: string | null;
  user_agent: string | null;
  ip_address: string | null;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
}
