export const SIGNAL_INGESTION_QUEUE = 'signal-ingestion';
export const EA_WEBSOCKET_PATH = '/ws/ea';
export const EA_DISPATCH_CHANNEL = 'tradepilot:ea:dispatch';
export const EA_DISPATCH_ACK_PREFIX = 'tradepilot:ea:dispatch:ack';
export const EA_PRESENCE_KEY_PREFIX = 'tradepilot:ea:presence';
export const SUPPORTED_SYMBOLS = ['XAUUSD', 'EURUSD', 'GBPUSD', 'BTCUSD', 'NAS100', 'US30'];
export const DEFAULT_EXCLUDED_SYMBOLS: string[] = [];
export const DEFAULT_SESSIONS = {
  london: true,
  newYork: true,
};
export const DEFAULT_EXECUTION_MODE = 'AUTO' as const;
export const DEFAULT_MAX_TRADES_PER_SYMBOL = 1;
export const DEFAULT_SYMBOL_COOLDOWN_MS = 3000;
export const DEFAULT_DUPLICATE_SIGNAL_WINDOW_MS = 60000;
export const DEFAULT_ACTIVE_SIGNAL_WINDOW_MS = 15 * 60_000;
export const DEFAULT_EA_PRESENCE_TTL_MS = 18_000;
export const DEFAULT_EA_SERVER_PING_INTERVAL_MS = 5_000;
export const DEFAULT_EA_HEARTBEAT_TIMEOUT_MS = 12_000;
export const DEFAULT_EA_DISPATCH_ACK_TIMEOUT_MS = 2_000;
export const TELEGRAM_DIALOG_SYNC_LIMIT = 200;
export const TELEGRAM_CLIENT_CONNECTION_RETRIES = 5;
export const DASHBOARD_RESULT_LIMIT = 10;
