export const EA_WEBSOCKET_PATH = '/ws/ea';
export const EA_DISPATCH_CHANNEL = 'tradepilot:ea:dispatch';
export const EA_DISPATCH_ACK_PREFIX = 'tradepilot:ea:dispatch:ack';
export const EA_PRESENCE_KEY_PREFIX = 'tradepilot:ea:presence';

export const API_KEY_PREFIX_EA = 'tp_ea';
export const API_KEY_PREFIX_REST = 'tp_sk';
/** Characters of a key kept in plaintext so the UI can identify it. */
export const API_KEY_DISPLAY_PREFIX_LENGTH = 11;

export const DEFAULT_EXCLUDED_SYMBOLS: string[] = [];
export const DEFAULT_SESSIONS = {
  london: true,
  newYork: true,
};

export const DEFAULT_AUTO_COPY_ENABLED = true;
export const DEFAULT_ALLOW_API_TRADE_OPENING = false;

/** Prefilled into every new copier link; mirrors copierRiskParamsSchema defaults. */
export const DEFAULT_COPIER_RISK_PARAMS = {
  sizingMode: 'MULTIPLIER' as const,
  fixedLot: null,
  lotMultiplier: 1,
  riskPercent: null,
  minLot: 0.01,
  maxLot: 5,
  maxOpenPositions: 10,
  maxDailyLossPercent: 5,
  maxDrawdownPercent: 20,
  equityFloor: null,
  maxSpreadPoints: null,
  maxSlippagePoints: 20,
  maxCopyDelayMs: 5_000,
  copyStopLoss: true,
  copyTakeProfit: true,
  copyModifications: true,
  copyPartialCloses: true,
  copyCloses: true,
  reverseCopy: false,
  symbolFilterMode: 'ALL' as const,
  symbolFilter: [] as string[],
  symbolPrefix: null,
  symbolSuffix: null,
};

export const DEFAULT_NOTIFICATION_CHANNELS = {
  email: true,
  whatsapp: false,
};

export const DEFAULT_NOTIFICATION_EVENTS = {
  newTradeOpened: true,
  tpHit: true,
  slHit: true,
  lowMargin: true,
  eaDisconnected: true,
  masterOffline: true,
  copyFailed: true,
  executionFailed: true,
  dailySummary: false,
};

export const DEFAULT_EA_PRESENCE_TTL_MS = 18_000;
export const DEFAULT_EA_SERVER_PING_INTERVAL_MS = 5_000;
export const DEFAULT_EA_HEARTBEAT_TIMEOUT_MS = 12_000;
export const DEFAULT_EA_DISPATCH_ACK_TIMEOUT_MS = 2_000;

export const DASHBOARD_RESULT_LIMIT = 10;
export const COPY_EVENT_FEED_LIMIT = 25;
/** A slave counts as online if its EA was seen inside this window. */
export const SLAVE_ONLINE_WINDOW_MS = 60_000;
