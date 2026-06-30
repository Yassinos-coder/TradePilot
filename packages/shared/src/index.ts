import { z } from 'zod';

export const signalActionSchema = z.enum([
  'OPEN',
  'PARTIAL_CLOSE',
  'CLOSE_ALL',
  'MOVE_SL',
]);
export const signalSideSchema = z.enum(['BUY', 'SELL']);
export const positionDirectionSchema = z.enum(['LONG', 'SHORT']);
export const tradeCloseReasonSchema = z.enum([
  'TP',
  'SL',
  'MANUAL',
  'PARTIAL',
  'BREAKEVEN',
  'UNKNOWN',
]);
export const executionModeSchema = z.enum(['AUTO', 'SEMI_AUTO', 'MANUAL']);
export const signalEntrySchema = z.enum(['MARKET', 'LIMIT', 'STOP', 'STOP_LIMIT']);
export const parserProviderSchema = z.enum(['REGEX', 'OPENAI']);
export const tradeLifecycleStatusSchema = z.enum(['OPEN', 'CLOSED', 'REJECTED']);
export const accountSourceSchema = z.enum(['MANUAL', 'EA']);
export const signalClassificationSchema = z.enum(['SIGNAL', 'MANAGEMENT', 'NOISE']);
export const signalIngestionSourceSchema = z.enum([
  'MANUAL',
  'TELEGRAM_REALTIME',
  'TELEGRAM_BACKFILL',
]);
export const commandResultStatusSchema = z.enum(['SUCCESS', 'ERROR']);

export const copierProgramStatusSchema = z.enum(['ACTIVE', 'PAUSED', 'DISABLED']);
export const followerDeviceStatusSchema = z.enum(['PENDING_APPROVAL', 'ACTIVE', 'REVOKED']);

export const createCopierProgramSchema = z.object({
  name: z.string().min(2).max(80),
  description: z.string().max(500).nullable().default(null),
  maxFollowerDevices: z.number().int().min(1).max(500).default(10),
  requiresApproval: z.boolean().default(false),
});

export const updateCopierProgramSchema = createCopierProgramSchema.partial().extend({
  status: copierProgramStatusSchema.optional(),
});

export const copierProgramSchema = z.object({
  id: z.string().min(1),
  providerUserId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable(),
  status: copierProgramStatusSchema,
  maxFollowerDevices: z.number().int().positive(),
  requiresApproval: z.boolean(),
  activeInviteCode: z.string().nullable(),
  followerCount: z.number().int().nonnegative(),
  onlineFollowerCount: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const followerDeviceSchema = z.object({
  id: z.string().min(1),
  programId: z.string().min(1),
  nickname: z.string().nullable(),
  accountLoginMasked: z.string().nullable(),
  brokerServer: z.string().nullable(),
  platform: z.enum(['MT4', 'MT5']).nullable(),
  status: followerDeviceStatusSchema,
  lastSeenAt: z.string().nullable(),
  createdAt: z.string(),
});

export const anonymousFollowerJoinSchema = z.object({
  inviteCode: z.string().min(6).max(40),
  nickname: z.string().min(1).max(80).nullable().optional(),
  accountLoginHash: z.string().min(16).max(256),
  brokerServer: z.string().min(1).max(120),
  platform: z.enum(['MT4', 'MT5']),
  terminalFingerprintHash: z.string().min(16).max(256),
});

export const anonymousFollowerJoinResultSchema = z.object({
  deviceId: z.string().min(1),
  programId: z.string().min(1),
  providerName: z.string().min(1),
  status: followerDeviceStatusSchema,
  token: z.string().min(32),
});

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
  fullName: z.string().nullable().default(null),
  phoneNumber: z.string().nullable().default(null),
  pendingEmail: z.string().email().nullable().default(null),
  apiKey: z.string().min(16),
  createdAt: z.string(),
});

export const updateProfileSchema = z.object({
  fullName: z.string().min(1).max(120).nullable(),
  phoneNumber: z.string().min(4).max(40).nullable(),
});

export const requestEmailChangeSchema = z.object({
  newEmail: z.string().email(),
});

export const verifyEmailChangeSchema = z.object({
  token: z.string().min(20),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(8),
  newPassword: z.string().min(8),
});

export const sessionDtoSchema = z.object({
  id: z.string().min(1),
  authSessionId: z.string().min(1),
  userAgent: z.string().nullable(),
  ipAddress: z.string().nullable(),
  lastSeenAt: z.string(),
  createdAt: z.string(),
});

export const sessionSettingsSchema = z.object({
  london: z.boolean(),
  newYork: z.boolean(),
});

export const settingsDtoSchema = z.object({
  riskPercent: z.number().min(0.1).max(10),
  maxTrades: z.number().int().min(1).max(20),
  maxSimultaneousTrades: z.number().int().min(1).max(50),
  maxDailyLossPercent: z.number().min(0.1).max(100),
  maxTradesPerDay: z.number().int().min(1).max(200),
  lowMarginThresholdPercent: z.number().min(1).max(100),
  autoCopyEnabled: z.boolean().default(true),
  executionPaused: z.boolean().default(false),
  executionPauseReason: z.string().nullable().default(null),
  executionPausedAt: z.string().nullable().default(null),
  excludedSymbols: z.array(z.string().min(2)).default([]),
  sessions: sessionSettingsSchema,
  mode: executionModeSchema,
  notificationChannels: z
    .object({
      email: z.boolean().default(true),
      telegram: z.boolean().default(true),
      whatsapp: z.boolean().default(false),
    })
    .default({
      email: true,
      telegram: true,
      whatsapp: false,
    }),
  notificationEvents: z
    .object({
      newTradeOpened: z.boolean().default(true),
      tpHit: z.boolean().default(true),
      slHit: z.boolean().default(true),
      lowMargin: z.boolean().default(true),
      eaDisconnected: z.boolean().default(true),
      telegramDisconnected: z.boolean().default(true),
      executionFailed: z.boolean().default(true),
      dailySummary: z.boolean().default(false),
    })
    .default({
      newTradeOpened: true,
      tpHit: true,
      slHit: true,
      lowMargin: true,
      eaDisconnected: true,
      telegramDisconnected: true,
      executionFailed: true,
      dailySummary: false,
    }),
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

export const notificationChannelPreferencesSchema = z.object({
  email: z.boolean(),
  telegram: z.boolean(),
  whatsapp: z.boolean(),
});

export const notificationEventPreferencesSchema = z.object({
  newTradeOpened: z.boolean(),
  tpHit: z.boolean(),
  slHit: z.boolean(),
  lowMargin: z.boolean(),
  eaDisconnected: z.boolean(),
  telegramDisconnected: z.boolean(),
  executionFailed: z.boolean(),
  dailySummary: z.boolean(),
});

export const notificationPreferencesSchema = z.object({
  channels: notificationChannelPreferencesSchema,
  events: notificationEventPreferencesSchema,
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

export const tradeHistoryFileStatusSchema = z.enum(['UPLOADED', 'PARSED', 'FAILED']);
export const tradeHistoryPlatformSchema = z.enum(['MT4', 'MT5', 'GENERIC']);

export const tradeHistoryFileDtoSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  originalFilename: z.string().min(1),
  storageBucket: z.string().min(1),
  storagePath: z.string().min(1),
  contentType: z.string().nullable().optional(),
  fileSize: z.number().int().nonnegative(),
  platform: tradeHistoryPlatformSchema,
  parsedTradeCount: z.number().int().nonnegative(),
  skippedRowCount: z.number().int().nonnegative(),
  status: tradeHistoryFileStatusSchema,
  accountId: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});

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
  openingOrderType: signalSideSchema.nullable().optional(),
  detectedTradeType: z.string().nullable().optional(),
  positionDirection: positionDirectionSchema.nullable().optional(),
  closeReason: tradeCloseReasonSchema.nullable().optional(),
  comment: z.string().nullable(),
  openedAt: z.string(),
  closedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const symbolBreakdownSchema = z.object({
  symbol: z.string(),
  trades: z.number().int(),
  wins: z.number().int(),
  losses: z.number().int(),
  winRate: z.number(),
  netProfit: z.number(),
  profitFactor: z.number(),
  avgWin: z.number(),
  avgLoss: z.number(),
  expectancy: z.number(),
});

export const directionBreakdownSchema = z.object({
  trades: z.number().int(),
  wins: z.number().int(),
  losses: z.number().int(),
  winRate: z.number(),
  netProfit: z.number(),
});

export const periodBreakdownSchema = z.object({
  key: z.string(),
  label: z.string(),
  trades: z.number().int().nonnegative(),
  wins: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  winRate: z.number(),
  netProfit: z.number(),
  averageTrade: z.number().nullable().optional(),
  averageWin: z.number().nullable().optional(),
  averageLoss: z.number().nullable().optional(),
  profitFactor: z.number().nullable().optional(),
  expectancy: z.number().nullable().optional(),
});

export const tradeTypeBreakdownSchema = z.object({
  tradeType: z.string(),
  trades: z.number().int().nonnegative(),
  wins: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  winRate: z.number(),
  netProfit: z.number(),
});

export const bestWorstPeriodSchema = z.object({
  period: z.string(),
  netProfit: z.number(),
});

export const equityCurvePointSchema = z.object({
  index: z.number().int().nonnegative(),
  closedAt: z.string(),
  cumulativePnL: z.number(),
  drawdown: z.number(),
  drawdownPercent: z.number(),
});

export const analyticsSummarySchema = z.object({
  startingBalance: z.number().nullable(),
  endingBalance: z.number().nullable(),
  currentBalance: z.number().nullable(),
  currentEquity: z.number().nullable(),
  totalClosedProfit: z.number(),
  floatingPl: z.number().nullable(),
  deposits: z.number().nullable(),
  withdrawals: z.number().nullable(),
  netDeposits: z.number().nullable(),
  totalReturnPercent: z.number().nullable(),
  accountGrowthPercent: z.number().nullable(),
  returnOnAccount: z.number().nullable(),
  roi: z.number().nullable(),
  annualizedReturn: z.number().nullable(),
  cagr: z.number().nullable(),

  totalTrades: z.number().int().nonnegative(),
  winningTrades: z.number().int().nonnegative(),
  losingTrades: z.number().int().nonnegative(),
  wins: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  winRate: z.number().min(0).max(100),
  lossRate: z.number().min(0).max(100),
  breakEvenTrades: z.number().int().nonnegative(),
  breakEvenRate: z.number().min(0).max(100).nullable(),
  profitFactor: z.number().min(0),
  netProfit: z.number(),
  grossProfit: z.number().min(0),
  grossLoss: z.number().min(0),
  avgWin: z.number(),
  avgLoss: z.number(),
  winLossRatio: z.number().nullable(),
  expectancy: z.number(),
  expectedValuePerTrade: z.number(),
  largestWin: z.number(),
  largestLoss: z.number(),
  averageTrade: z.number(),

  sharpeRatio: z.number().nullable(),
  sortinoRatio: z.number().nullable(),
  calmarRatio: z.number().nullable(),
  sterlingRatio: z.number().nullable(),
  omegaRatio: z.number().nullable(),
  informationRatio: z.number().nullable(),
  treynorRatio: z.number().nullable(),
  jensensAlpha: z.number().nullable(),

  maxDrawdown: z.number(),
  maxDrawdownPercent: z.number().nullable(),
  averageDrawdown: z.number(),
  medianDrawdown: z.number().nullable(),
  drawdownDurationHours: z.number().nullable(),
  recoveryDurationHours: z.number().nullable(),
  recoveryFactor: z.number().nullable(),
  ulcerIndex: z.number().nullable(),
  painIndex: z.number().nullable(),

  avgHoldTimeHours: z.number().nullable(),
  avgWinHoldTimeHours: z.number().nullable(),
  avgLossHoldTimeHours: z.number().nullable(),
  longestTradeHours: z.number().nullable(),
  shortestTradeHours: z.number().nullable(),
  averageTimeBetweenTradesHours: z.number().nullable(),
  tradesPerDay: z.number().nullable(),
  tradesPerWeek: z.number().nullable(),
  tradesPerMonth: z.number().nullable(),
  bestDay: bestWorstPeriodSchema.nullable(),
  worstDay: bestWorstPeriodSchema.nullable(),
  bestMonth: bestWorstPeriodSchema.nullable(),
  worstMonth: bestWorstPeriodSchema.nullable(),
  timeInMarketPercent: z.number().nullable(),

  maxConsecutiveWins: z.number().int(),
  maxConsecutiveLosses: z.number().int(),
  currentWinningStreak: z.number().int(),
  currentLosingStreak: z.number().int(),
  largestWinningStreakProfit: z.number().nullable(),
  largestLosingStreakLoss: z.number().nullable(),
  riskRewardRatio: z.number().nullable(),
  riskPerTradePercent: z.number().nullable(),
  maximumDailyLoss: z.number().nullable(),
  maximumWeeklyLoss: z.number().nullable(),
  maximumMonthlyLoss: z.number().nullable(),
  largestWinningDay: z.number().nullable(),
  largestLosingDay: z.number().nullable(),
  averageDailyReturn: z.number().nullable(),
  largestWinningTradePercent: z.number().nullable(),
  largestLosingTradePercent: z.number().nullable(),
  valueAtRisk95: z.number().nullable(),
  conditionalVar95: z.number().nullable(),
  kellyCriterion: z.number().nullable(),
  averageR: z.number().nullable(),
  standardDeviationReturns: z.number().nullable(),
  volatilityAnnualized: z.number().nullable(),

  averagePositionSize: z.number().nullable(),
  averageLeverage: z.number().nullable(),
  maxLeverage: z.number().nullable(),
  marginUtilization: z.number().nullable(),
  exposurePercent: z.number().nullable(),
  concentrationRisk: z.number().nullable(),
  topInstrumentExposure: z.number().nullable(),
  topSymbolContribution: z.number().nullable(),
  topSessionContribution: z.number().nullable(),
  topDirectionContribution: z.number().nullable(),

  totalCommissionPaid: z.number().nullable(),
  totalSwapRolloverFees: z.number().nullable(),
  avgSpreadCostPerTrade: z.number().nullable(),
  avgSlippage: z.number().nullable(),
  netProfitAfterCosts: z.number(),

  bySymbol: z.array(symbolBreakdownSchema),
  longTrades: directionBreakdownSchema,
  shortTrades: directionBreakdownSchema,
  bySession: z.array(periodBreakdownSchema),
  byDayOfWeek: z.array(periodBreakdownSchema),
  byHourOfDay: z.array(periodBreakdownSchema),
  byTradeType: z.array(tradeTypeBreakdownSchema),

  equityHighWaterMark: z.number(),
  equityCurveSlope: z.number().nullable(),
  equityCurveRSquared: z.number().nullable(),
  equityCurveLinearity: z.number().nullable(),
  equityCurve: z.array(equityCurvePointSchema),

  alpha: z.number().nullable(),
  beta: z.number().nullable(),
  correlationToBenchmark: z.number().nullable(),
  trackingError: z.number().nullable(),

  metricAvailability: z.record(z.string(), z.object({
    available: z.boolean(),
    reason: z.string().nullable(),
    formula: z.string(),
    source: z.string(),
  })).optional(),
  assumptions: z.array(z.string()),
  dataSufficiency: z.object({
    sufficient: z.boolean(),
    reason: z.string().nullable(),
    minimumTradeCount: z.number().int().positive(),
    observedTradeCount: z.number().int().nonnegative(),
  }),
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
  'PARSED',
  'VALIDATED',
  'DISPATCHED',
  'EXECUTED',
  'PARSE_FAILED',
  'VALIDATION_FAILED',
  'EA_OFFLINE',
  'DISPATCH_TIMEOUT',
  'EXECUTION_REJECTED',
  'IGNORED',
  'BLOCKED',
  'AUTO_COPY_DISABLED',
  'SYMBOL_UNRESOLVED',
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
  classification: signalClassificationSchema.default('SIGNAL'),
  deletedAt: z.string().nullable().optional(),
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
  'AUTO_COPY_DISABLED',
  'IGNORED',
  'BLOCKED',
  'RISK_LIMIT_HIT',
  'FAILSAFE_TRIGGERED',
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
  tradingEngine: z.object({
    autoCopyEnabled: z.boolean(),
    executionPaused: z.boolean(),
    executionPauseReason: z.string().nullable(),
    telegramConnected: z.boolean(),
    riskStatus: z.enum(['OK', 'LIMIT_HIT', 'PAUSED']),
    connectedAccounts: z.number().int().nonnegative(),
    lastSignalAt: z.string().nullable(),
    lastTradeAt: z.string().nullable(),
  }),
});

export const eaAuthMessageSchema = z.object({
  type: z.literal('auth'),
  apiKey: z.string().min(16),
  accountId: z.string().min(1),
  accountName: z.string().min(1),
});

export const eaFollowerAuthMessageSchema = z.object({
  type: z.literal('auth_follower'),
  token: z.string().min(32),
  deviceId: z.string().min(1),
  accountLoginHash: z.string().min(16),
  terminalFingerprintHash: z.string().min(16),
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
  opening_order_type: signalSideSchema.nullable().optional(),
  position_direction: positionDirectionSchema.nullable().optional(),
  close_reason: tradeCloseReasonSchema.nullable().optional(),
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

export const eaSyncStateMessageSchema = z.object({
  type: z.literal('sync_state'),
  request_id: z.string().min(1),
});

export const eaSyncStateCompleteMessageSchema = z.object({
  type: z.literal('sync_state_complete'),
  accountId: z.string().min(1),
  request_id: z.string().min(1),
  synced_at: z.string().nullable().optional(),
  synced_trades: z.number().int().nonnegative().optional(),
});

export const eaCopyTradeEventMessageSchema = z.object({
  type: z.literal('copy_trade_event'),
  providerProgramId: z.string().min(1),
  providerTradeId: z.string().min(1),
  data: eaTradeEventPayloadSchema,
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
  eaFollowerAuthMessageSchema,
  eaPingMessageSchema,
  eaPongMessageSchema,
  eaSymbolsMessageSchema,
  eaAccountStatusMessageSchema,
  eaTradeEventMessageSchema,
  eaCommandResultMessageSchema,
  eaSyncStateCompleteMessageSchema,
]);

export const eaOutboundMessageSchema = z.discriminatedUnion('type', [
  eaAuthSuccessMessageSchema,
  eaPingMessageSchema,
  eaPongMessageSchema,
  eaErrorMessageSchema,
  eaSyncStateMessageSchema,
  eaCopyTradeEventMessageSchema,
  eaSignalMessageSchema,
  eaPartialCloseMessageSchema,
  eaCloseAllMessageSchema,
  eaMoveSlMessageSchema,
]);

export type SignalAction = z.infer<typeof signalActionSchema>;
export type CopierProgramStatus = z.infer<typeof copierProgramStatusSchema>;
export type FollowerDeviceStatus = z.infer<typeof followerDeviceStatusSchema>;
export type CreateCopierProgramInput = z.infer<typeof createCopierProgramSchema>;
export type UpdateCopierProgramInput = z.infer<typeof updateCopierProgramSchema>;
export type CopierProgramDTO = z.infer<typeof copierProgramSchema>;
export type FollowerDeviceDTO = z.infer<typeof followerDeviceSchema>;
export type AnonymousFollowerJoinInput = z.infer<typeof anonymousFollowerJoinSchema>;
export type AnonymousFollowerJoinResult = z.infer<typeof anonymousFollowerJoinResultSchema>;
export type SignalDTO = z.infer<typeof signalDtoSchema>;
export type UserDTO = z.infer<typeof userDtoSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type RequestEmailChangeInput = z.infer<typeof requestEmailChangeSchema>;
export type VerifyEmailChangeInput = z.infer<typeof verifyEmailChangeSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type UserSessionDTO = z.infer<typeof sessionDtoSchema>;
export type SettingsDTO = z.infer<typeof settingsDtoSchema>;
export type ExecutionMode = z.infer<typeof executionModeSchema>;
export type PositionDirection = z.infer<typeof positionDirectionSchema>;
export type TradeCloseReason = z.infer<typeof tradeCloseReasonSchema>;
export type AccountDTO = z.infer<typeof accountDtoSchema>;
export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type AccountStatusDTO = z.infer<typeof accountStatusDtoSchema>;
export type NotificationPreferencesDTO = z.infer<typeof notificationPreferencesSchema>;
export type TradeHistoryFileDTO = z.infer<typeof tradeHistoryFileDtoSchema>;
export type TradeExecutionDTO = z.infer<typeof tradeExecutionDtoSchema>;
export type AnalyticsSummaryDTO = z.infer<typeof analyticsSummarySchema>;
export type SymbolBreakdownDTO = z.infer<typeof symbolBreakdownSchema>;
export type DirectionBreakdownDTO = z.infer<typeof directionBreakdownSchema>;
export type PeriodBreakdownDTO = z.infer<typeof periodBreakdownSchema>;
export type TradeTypeBreakdownDTO = z.infer<typeof tradeTypeBreakdownSchema>;
export type BestWorstPeriodDTO = z.infer<typeof bestWorstPeriodSchema>;
export type EquityCurvePointDTO = z.infer<typeof equityCurvePointSchema>;
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
export type SignalClassification = z.infer<typeof signalClassificationSchema>;
export type SignalRecordDTO = z.infer<typeof signalRecordSchema>;
export type SignalIngestionSource = z.infer<typeof signalIngestionSourceSchema>;
export type ExecutionStatus = z.infer<typeof executionStatusSchema>;
export type ExecutionLogDTO = z.infer<typeof executionLogSchema>;
export type DashboardOverviewDTO = z.infer<typeof dashboardOverviewSchema>;
export type WebSocketInboundMessage = z.infer<typeof eaInboundMessageSchema>;
export type WebSocketOutboundMessage = z.infer<typeof eaOutboundMessageSchema>;
export type EaFollowerAuthMessage = z.infer<typeof eaFollowerAuthMessageSchema>;
export type EaCopyTradeEventMessage = z.infer<typeof eaCopyTradeEventMessageSchema>;
export type EaAccountStatusPayload = z.infer<typeof eaAccountStatusPayloadSchema>;
export type EaTradeEventPayload = z.infer<typeof eaTradeEventPayloadSchema>;
export type EaTradePayload = z.infer<typeof eaTradePayloadSchema>;
export type EaCommandResultStatus = z.infer<typeof commandResultStatusSchema>;

export const manualDispatchSchema = z.object({
  accountId: z.string().uuid(),
});

export const signalHistoryFilterSchema = z.enum([
  'ALL',
  'SIGNALS',
  'MANAGEMENT',
  'NOISE',
]);

export const softDeleteSignalsSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).optional(),
  clearAll: z.boolean().optional(),
});

export type ManualDispatchInput = z.infer<typeof manualDispatchSchema>;
export type SignalHistoryFilter = z.infer<typeof signalHistoryFilterSchema>;
export type SoftDeleteSignalsInput = z.infer<typeof softDeleteSignalsSchema>;

export const dailyTradeSummaryItemSchema = z.object({
  date: z.string(),
  netProfit: z.number(),
  tradeCount: z.number().int(),
  wins: z.number().int(),
  losses: z.number().int(),
  winRate: z.number(),
  bestTrade: z.number().nullable(),
  worstTrade: z.number().nullable(),
  symbols: z.array(z.string()),
});

export const dailyTradeSummarySchema = z.array(dailyTradeSummaryItemSchema);

export type DailyTradeSummaryItem = z.infer<typeof dailyTradeSummaryItemSchema>;
export type DailyTradeSummaryDTO = z.infer<typeof dailyTradeSummarySchema>;
