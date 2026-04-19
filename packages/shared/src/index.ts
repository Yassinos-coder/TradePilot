import { z } from 'zod';

export const signalActionSchema = z.enum([
  'OPEN',
  'PARTIAL_CLOSE',
  'CLOSE_ALL',
  'MOVE_SL',
]);
export const signalSideSchema = z.enum(['BUY', 'SELL']);
export const executionModeSchema = z.enum(['AUTO', 'SEMI_AUTO', 'MANUAL']);
export const signalEntrySchema = z.enum(['MARKET', 'LIMIT']);
export const parserProviderSchema = z.enum(['REGEX', 'OPENAI']);
export const tradeLifecycleStatusSchema = z.enum(['OPEN', 'CLOSED', 'REJECTED']);
export const accountSourceSchema = z.enum(['MANUAL', 'EA']);
export const signalIngestionSourceSchema = z.enum([
  'MANUAL',
  'TELEGRAM_REALTIME',
  'TELEGRAM_BACKFILL',
]);
export const commandResultStatusSchema = z.enum(['SUCCESS', 'ERROR']);

export const signalDtoSchema = z.object({
  action: signalActionSchema,
  symbol: z.string().min(2).max(32).transform((value) => value.toUpperCase()),
  type: signalSideSchema.nullable(),
  entry: signalEntrySchema.nullable(),
  entryPrice: z.number().positive().nullable(),
  stopLoss: z.number().positive().nullable(),
  takeProfits: z.array(z.number().positive()),
  closePercent: z.number().min(1).max(100).nullable(),
  newStopLoss: z.number().positive().nullable(),
  sourceChannel: z.string().min(1).optional(),
  confidence: z.number().min(0).max(1),
  parser: parserProviderSchema,
});

export const userDtoSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  apiKey: z.string().min(16),
  createdAt: z.string(),
});

export const sessionSettingsSchema = z.object({
  london: z.boolean(),
  newYork: z.boolean(),
});

export const settingsDtoSchema = z.object({
  riskPercent: z.number().min(0.1).max(10),
  maxTrades: z.number().int().min(1).max(20),
  excludedSymbols: z.array(z.string().min(2)).default([]),
  sessions: sessionSettingsSchema,
  mode: executionModeSchema,
});

export const accountStatusDtoSchema = z.object({
  accountId: z.string().min(1),
  accountName: z.string().nullable().optional(),
  balance: z.number(),
  equity: z.number(),
  margin: z.number(),
  freeMargin: z.number(),
  drawdownPercent: z.number().min(0),
  openPositions: z.number().int().nonnegative(),
  reportedAt: z.string(),
});

export const accountDtoSchema = z.object({
  id: z.string().min(1),
  externalAccountId: z.string().nullable().optional(),
  name: z.string().min(1),
  broker: z.string().nullable().optional(),
  source: accountSourceSchema.default('EA'),
  online: z.boolean().default(false),
  latencyMs: z.number().int().nonnegative().nullable().optional(),
  lastSeenAt: z.string().nullable().optional(),
  latestStatus: accountStatusDtoSchema.nullable().optional(),
  createdAt: z.string(),
});

export const createAccountSchema = z.object({
  name: z.string().min(1).max(80),
  broker: z.string().min(1).max(80),
});

export const accountStatusHistorySchema = z.array(accountStatusDtoSchema);

export const tradeExecutionDtoSchema = z.object({
  id: z.string().min(1),
  signalId: z.string().nullable(),
  accountId: z.string().min(1),
  accountName: z.string().nullable().optional(),
  ticket: z.string().min(1),
  symbol: z.string().min(2).max(32).transform((value) => value.toUpperCase()),
  type: signalSideSchema,
  volume: z.number().positive(),
  entryPrice: z.number(),
  exitPrice: z.number().nullable(),
  stopLoss: z.number().nullable(),
  takeProfit: z.number().nullable(),
  profit: z.number(),
  status: tradeLifecycleStatusSchema,
  comment: z.string().nullable(),
  openedAt: z.string(),
  closedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const analyticsSummarySchema = z.object({
  totalTrades: z.number().int().nonnegative(),
  wins: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  winRate: z.number().min(0).max(100),
  profitFactor: z.number().min(0),
  netProfit: z.number(),
  grossProfit: z.number().min(0),
  grossLoss: z.number().min(0),
});

export const telegramConnectionStatusSchema = z.enum([
  'DISCONNECTED',
  'PENDING_CODE',
  'PENDING_PASSWORD',
  'CONNECTED',
  'ERROR',
]);

export const telegramChannelKindSchema = z.enum(['CHANNEL', 'GROUP']);

export const telegramConnectionSchema = z.object({
  status: telegramConnectionStatusSchema,
  phoneNumber: z.string().nullable(),
  displayName: z.string().nullable(),
  username: z.string().nullable(),
  telegramUserId: z.string().nullable(),
  lastConnectedAt: z.string().nullable(),
  lastSyncedAt: z.string().nullable(),
  lastError: z.string().nullable(),
});

export const telegramChannelSchema = z.object({
  id: z.string().min(1),
  externalId: z.string().min(1),
  name: z.string().min(1),
  username: z.string().nullable().optional(),
  kind: telegramChannelKindSchema,
  enabled: z.boolean(),
});

export const telegramConnectStartSchema = z.object({
  phoneNumber: z
    .string()
    .min(7)
    .max(32)
    .regex(/^\+?[0-9()\-.\s]+$/, 'Use an international phone number format'),
});

export const telegramConnectCodeSchema = z.object({
  phoneCode: z
    .string()
    .min(3)
    .max(12)
    .regex(/^[0-9]+$/, 'Code must contain only numbers'),
});

export const telegramConnectPasswordSchema = z.object({
  password: z.string().min(1),
});

export const telegramCodeDeliverySchema = z.enum(['APP', 'SMS']);

export const telegramConnectStartResultSchema = z.object({
  connection: telegramConnectionSchema,
  codeDelivery: telegramCodeDeliverySchema,
});

export const telegramChannelSyncResultSchema = z.object({
  connection: telegramConnectionSchema,
  channels: z.array(telegramChannelSchema),
  syncedCount: z.number().int().nonnegative(),
});

export const signalStatusSchema = z.enum([
  'PENDING',
  'VALIDATED',
  'DISPATCHED',
  'PARSE_FAILED',
  'VALIDATION_FAILED',
  'EA_OFFLINE',
  'DISPATCH_TIMEOUT',
  'EXECUTION_REJECTED',
]);

export const signalRecordSchema = z.object({
  id: z.string().min(1),
  rawMessage: z.string().min(1),
  rawMessageHash: z.string().min(16).nullable().optional(),
  sourceChannel: z.string().nullable().optional(),
  telegramMessageId: z.string().nullable().optional(),
  telegramChannelId: z.string().nullable().optional(),
  messageTimestamp: z.string().nullable().optional(),
  ingestionSource: signalIngestionSourceSchema.optional(),
  parsedData: signalDtoSchema.nullable().catch(null),
  status: signalStatusSchema,
  confidence: z.number().min(0).max(1).nullable().optional(),
  createdAt: z.string(),
});

export const executionStatusSchema = z.enum([
  'RECEIVED',
  'RETRYING',
  'DISPATCHED',
  'PARSE_FAILED',
  'PARSING_COMPLETED',
  'VALIDATION_FAILED',
  'VALIDATION_COMPLETED',
  'TELEGRAM_MESSAGE_RECEIVED',
  'SYMBOL_MAPPED',
  'SYMBOL_MAPPING_FAILED',
  'EA_OFFLINE',
  'DISPATCH_TIMEOUT',
  'EXECUTION_REJECTED',
  'ACCOUNT_STATUS_RECEIVED',
  'TRADE_OPENED',
  'TRADE_CLOSED',
  'TRADE_REJECTED',
  'COMMAND_SUCCEEDED',
  'COMMAND_FAILED',
]);

export const executionLogSchema = z.object({
  id: z.string().min(1),
  signalId: z.string().nullable(),
  accountId: z.string().nullable().optional(),
  accountName: z.string().nullable().optional(),
  executionKey: z.string().nullable().optional(),
  attempt: z.number().int().min(0),
  status: executionStatusSchema,
  message: z.string(),
  details: z.record(z.string(), z.unknown()).nullable().optional(),
  createdAt: z.string(),
});

export const dashboardOverviewSchema = z.object({
  eaOnline: z.boolean(),
  eaLatencyMs: z.number().int().nonnegative().nullable(),
  eaLastSeenAt: z.string().nullable(),
  signalCount: z.number().int().nonnegative(),
  accountStatus: accountStatusDtoSchema.nullable(),
  connectedAccounts: z.array(accountDtoSchema),
  lastTelegramMessage: signalRecordSchema.nullable(),
  recentSignals: z.array(signalRecordSchema),
  recentExecutionLogs: z.array(executionLogSchema),
  recentTrades: z.array(tradeExecutionDtoSchema),
  analytics: analyticsSummarySchema,
});

export const eaAuthMessageSchema = z.object({
  type: z.literal('auth'),
  apiKey: z.string().min(16),
  accountId: z.string().min(1),
  accountName: z.string().min(1),
});

export const eaPingMessageSchema = z.object({
  type: z.literal('ping'),
  timestamp: z.number().int().optional(),
});

export const eaPongMessageSchema = z.object({
  type: z.literal('pong'),
  timestamp: z.number().int().optional(),
});

export const eaSymbolsMessageSchema = z.object({
  type: z.literal('symbols'),
  accountId: z.string().min(1),
  symbols: z.array(z.string().min(1)),
});

export const eaAccountStatusPayloadSchema = z.object({
  balance: z.number(),
  equity: z.number(),
  margin: z.number(),
  freeMargin: z.number(),
  drawdownPercent: z.number().min(0),
  openPositions: z.number().int().nonnegative(),
});

export const eaAccountStatusMessageSchema = z.object({
  type: z.literal('account_status'),
  accountId: z.string().min(1),
  data: eaAccountStatusPayloadSchema,
});

export const eaTradeEventPayloadSchema = z.object({
  ticket: z.union([z.string(), z.number(), z.bigint()]).transform((value) => String(value)),
  signal_id: z.string().optional().nullable(),
  symbol: z.string().min(2).max(32).transform((value) => value.toUpperCase()),
  type: signalSideSchema,
  volume: z.number().positive(),
  entry_price: z.number(),
  exit_price: z.number().nullable(),
  stop_loss: z.number().nullable(),
  take_profit: z.number().nullable(),
  profit: z.number(),
  status: tradeLifecycleStatusSchema,
  comment: z.string().nullable().optional(),
  opened_at: z.string(),
  closed_at: z.string().nullable(),
});

export const eaTradeEventMessageSchema = z.object({
  type: z.literal('trade_event'),
  accountId: z.string().min(1),
  data: eaTradeEventPayloadSchema,
});

export const eaCommandResultMessageSchema = z.object({
  type: z.literal('command_result'),
  accountId: z.string().min(1),
  action: signalActionSchema,
  symbol: z.string().min(2).max(32).transform((value) => value.toUpperCase()),
  status: commandResultStatusSchema,
  message: z.string().min(1),
  signal_id: z.string().nullable().optional(),
  execution_key: z.string().nullable().optional(),
  details: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const eaAuthSuccessMessageSchema = z.object({
  type: z.literal('auth_success'),
});

export const eaErrorMessageSchema = z.object({
  type: z.literal('error'),
  message: z.string().min(1),
});

export const eaTradePayloadSchema = z.object({
  symbol: z.string().min(2),
  type: signalSideSchema,
  entry: signalEntrySchema,
  entry_price: z.number().positive().nullable(),
  stop_loss: z.number().positive().nullable(),
  take_profit: z.number().positive(),
  signal_id: z.string().min(1).optional(),
  execution_key: z.string().min(1).optional(),
});

export const eaSignalMessageSchema = z.object({
  type: z.literal('signal'),
  data: z.array(eaTradePayloadSchema).min(1),
});

export const eaPartialCloseMessageSchema = z.object({
  type: z.literal('partial_close'),
  symbol: z.string().min(2).max(32).transform((value) => value.toUpperCase()),
  percent: z.number().min(1).max(100),
  signal_id: z.string().nullable().optional(),
  execution_key: z.string().nullable().optional(),
});

export const eaCloseAllMessageSchema = z.object({
  type: z.literal('close_all'),
  symbol: z.string().min(2).max(32).transform((value) => value.toUpperCase()),
  signal_id: z.string().nullable().optional(),
  execution_key: z.string().nullable().optional(),
});

export const eaMoveSlMessageSchema = z.object({
  type: z.literal('move_sl'),
  symbol: z.string().min(2).max(32).transform((value) => value.toUpperCase()),
  new_stop_loss: z.number().positive(),
  signal_id: z.string().nullable().optional(),
  execution_key: z.string().nullable().optional(),
});

export const eaInboundMessageSchema = z.discriminatedUnion('type', [
  eaAuthMessageSchema,
  eaPingMessageSchema,
  eaPongMessageSchema,
  eaSymbolsMessageSchema,
  eaAccountStatusMessageSchema,
  eaTradeEventMessageSchema,
  eaCommandResultMessageSchema,
]);

export const eaOutboundMessageSchema = z.discriminatedUnion('type', [
  eaAuthSuccessMessageSchema,
  eaPingMessageSchema,
  eaPongMessageSchema,
  eaErrorMessageSchema,
  eaSignalMessageSchema,
  eaPartialCloseMessageSchema,
  eaCloseAllMessageSchema,
  eaMoveSlMessageSchema,
]);

export type SignalAction = z.infer<typeof signalActionSchema>;
export type SignalDTO = z.infer<typeof signalDtoSchema>;
export type UserDTO = z.infer<typeof userDtoSchema>;
export type SettingsDTO = z.infer<typeof settingsDtoSchema>;
export type ExecutionMode = z.infer<typeof executionModeSchema>;
export type AccountDTO = z.infer<typeof accountDtoSchema>;
export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type AccountStatusDTO = z.infer<typeof accountStatusDtoSchema>;
export type TradeExecutionDTO = z.infer<typeof tradeExecutionDtoSchema>;
export type AnalyticsSummaryDTO = z.infer<typeof analyticsSummarySchema>;
export type TelegramConnectionStatus = z.infer<typeof telegramConnectionStatusSchema>;
export type TelegramChannelKind = z.infer<typeof telegramChannelKindSchema>;
export type TelegramConnectionDTO = z.infer<typeof telegramConnectionSchema>;
export type TelegramChannelDTO = z.infer<typeof telegramChannelSchema>;
export type TelegramConnectStartInput = z.infer<typeof telegramConnectStartSchema>;
export type TelegramConnectCodeInput = z.infer<typeof telegramConnectCodeSchema>;
export type TelegramConnectPasswordInput = z.infer<typeof telegramConnectPasswordSchema>;
export type TelegramCodeDelivery = z.infer<typeof telegramCodeDeliverySchema>;
export type TelegramConnectStartResult = z.infer<typeof telegramConnectStartResultSchema>;
export type TelegramChannelSyncResult = z.infer<typeof telegramChannelSyncResultSchema>;
export type SignalStatus = z.infer<typeof signalStatusSchema>;
export type SignalRecordDTO = z.infer<typeof signalRecordSchema>;
export type SignalIngestionSource = z.infer<typeof signalIngestionSourceSchema>;
export type ExecutionStatus = z.infer<typeof executionStatusSchema>;
export type ExecutionLogDTO = z.infer<typeof executionLogSchema>;
export type DashboardOverviewDTO = z.infer<typeof dashboardOverviewSchema>;
export type WebSocketInboundMessage = z.infer<typeof eaInboundMessageSchema>;
export type WebSocketOutboundMessage = z.infer<typeof eaOutboundMessageSchema>;
export type EaAccountStatusPayload = z.infer<typeof eaAccountStatusPayloadSchema>;
export type EaTradeEventPayload = z.infer<typeof eaTradeEventPayloadSchema>;
export type EaTradePayload = z.infer<typeof eaTradePayloadSchema>;
export type EaCommandResultStatus = z.infer<typeof commandResultStatusSchema>;

export const manualDispatchSchema = z.object({
  accountId: z.string().uuid(),
});

export type ManualDispatchInput = z.infer<typeof manualDispatchSchema>;
