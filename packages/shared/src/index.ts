import { z } from 'zod';

/* ─── primitives ─────────────────────────────────────────────────────────── */

export const orderSideSchema = z.enum(['BUY', 'SELL']);
export const orderEntrySchema = z.enum(['MARKET', 'LIMIT', 'STOP', 'STOP_LIMIT']);
export const positionDirectionSchema = z.enum(['LONG', 'SHORT']);
export const tradeCloseReasonSchema = z.enum([
  'TP',
  'SL',
  'MANUAL',
  'PARTIAL',
  'BREAKEVEN',
  'UNKNOWN',
]);
export const tradeLifecycleStatusSchema = z.enum(['OPEN', 'CLOSED', 'REJECTED']);
export const accountSourceSchema = z.enum(['MANUAL', 'EA']);
export const accountRoleSchema = z.enum(['MASTER', 'SLAVE', 'UNASSIGNED']);
export const platformSchema = z.enum(['MT4', 'MT5']);
export const commandResultStatusSchema = z.enum(['SUCCESS', 'ERROR']);

const symbolSchema = z
  .string()
  .min(2)
  .max(32)
  .transform((value) => value.toUpperCase());

const ticketSchema = z
  .union([z.string(), z.number(), z.bigint()])
  .transform((value) => String(value));

/* ─── copier ─────────────────────────────────────────────────────────────── */

export const sizingModeSchema = z.enum([
  'FIXED_LOT',
  'MULTIPLIER',
  'RISK_PERCENT',
  'BALANCE_RATIO',
]);
export const symbolFilterModeSchema = z.enum(['ALL', 'ALLOWLIST', 'BLOCKLIST']);
export const copyActionSchema = z.enum(['OPEN', 'CLOSE', 'PARTIAL_CLOSE', 'MODIFY']);
export const copyOrderStatusSchema = z.enum([
  'PENDING',
  'SENT',
  'FILLED',
  'SKIPPED',
  'REJECTED',
  'FAILED',
]);

/**
 * The risk-aware parameter set applied to one master → slave route.
 * Every field is user-configurable; nothing here is global.
 */
export const copierRiskParamsSchema = z.object({
  sizingMode: sizingModeSchema.default('MULTIPLIER'),
  fixedLot: z.number().positive().max(100).nullable().default(null),
  lotMultiplier: z.number().positive().max(100).default(1),
  riskPercent: z.number().min(0.01).max(100).nullable().default(null),
  minLot: z.number().positive().max(100).default(0.01),
  maxLot: z.number().positive().max(1000).default(5),

  maxOpenPositions: z.number().int().min(1).max(500).default(10),
  maxDailyLossPercent: z.number().min(0.1).max(100).default(5),
  maxDrawdownPercent: z.number().min(0.1).max(100).default(20),
  equityFloor: z.number().min(0).nullable().default(null),
  maxSpreadPoints: z.number().int().min(0).max(100_000).nullable().default(null),
  maxSlippagePoints: z.number().int().min(0).max(10_000).default(20),
  maxCopyDelayMs: z.number().int().min(0).max(600_000).default(5_000),

  copyStopLoss: z.boolean().default(true),
  copyTakeProfit: z.boolean().default(true),
  copyModifications: z.boolean().default(true),
  copyPartialCloses: z.boolean().default(true),
  copyCloses: z.boolean().default(true),
  reverseCopy: z.boolean().default(false),

  symbolFilterMode: symbolFilterModeSchema.default('ALL'),
  symbolFilter: z.array(symbolSchema).default([]),
  symbolPrefix: z.string().max(16).nullable().default(null),
  symbolSuffix: z.string().max(16).nullable().default(null),
});

export const createCopierLinkSchema = copierRiskParamsSchema
  .extend({
    slaveAccountId: z.string().uuid(),
    enabled: z.boolean().default(true),
  })
  .refine((value) => value.sizingMode !== 'FIXED_LOT' || value.fixedLot !== null, {
    message: 'FIXED_LOT sizing requires a fixed lot',
    path: ['fixedLot'],
  })
  .refine((value) => value.sizingMode !== 'RISK_PERCENT' || value.riskPercent !== null, {
    message: 'RISK_PERCENT sizing requires a risk percent',
    path: ['riskPercent'],
  })
  .refine((value) => value.maxLot >= value.minLot, {
    message: 'Max lot must be greater than or equal to min lot',
    path: ['maxLot'],
  });

export const updateCopierLinkSchema = copierRiskParamsSchema
  .partial()
  .extend({ enabled: z.boolean().optional() });

export const copierLinkSchema = copierRiskParamsSchema.extend({
  id: z.string().min(1),
  masterAccountId: z.string().min(1),
  slaveAccountId: z.string().min(1),
  slaveAccountName: z.string().nullable(),
  slaveAccountOnline: z.boolean().default(false),
  enabled: z.boolean(),
  copiesToday: z.number().int().nonnegative().default(0),
  lastCopyAt: z.string().nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const setMasterAccountSchema = z.object({
  accountId: z.string().uuid().nullable(),
});

export const copyOrderSchema = z.object({
  id: z.string().min(1),
  copierLinkId: z.string().min(1),
  slaveAccountId: z.string().min(1),
  slaveAccountName: z.string().nullable().optional(),
  masterTicket: z.string().min(1),
  slaveTicket: z.string().nullable(),
  requestedSymbol: z.string(),
  resolvedSymbol: z.string().nullable(),
  side: orderSideSchema.nullable(),
  requestedVolume: z.number().nullable(),
  filledVolume: z.number().nullable(),
  status: copyOrderStatusSchema,
  skipReason: z.string().nullable(),
  createdAt: z.string(),
});

export const copyEventSchema = z.object({
  id: z.string().min(1),
  masterAccountId: z.string().min(1),
  masterAccountName: z.string().nullable().optional(),
  masterTicket: z.string().min(1),
  action: copyActionSchema,
  symbol: z.string(),
  side: orderSideSchema.nullable(),
  volume: z.number().nullable(),
  entryPrice: z.number().nullable(),
  stopLoss: z.number().nullable(),
  takeProfit: z.number().nullable(),
  closePercent: z.number().nullable(),
  masterEventAt: z.string(),
  createdAt: z.string(),
  orders: z.array(copyOrderSchema).default([]),
});

/* ─── api keys ───────────────────────────────────────────────────────────── */

export const apiKeyKindSchema = z.enum(['EA', 'REST']);

export const apiKeySchema = z.object({
  id: z.string().min(1),
  kind: apiKeyKindSchema,
  name: z.string().min(1),
  prefix: z.string().min(1),
  scopes: z.array(z.string()).default([]),
  lastUsedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
  rotatedFromId: z.string().nullable(),
  createdAt: z.string(),
});

export const createApiKeySchema = z.object({
  kind: apiKeyKindSchema,
  name: z.string().min(1).max(80),
  /** Require an HMAC signature on every REST call made with this key. */
  requireHmac: z.boolean().default(false),
});

export const rotateApiKeySchema = z.object({
  /** Hours the superseded key keeps working. 0 revokes it immediately. */
  graceHours: z.number().int().min(0).max(720).default(24),
});

/** The plaintext secret is returned exactly once, at creation or rotation. */
export const apiKeySecretResultSchema = z.object({
  key: apiKeySchema,
  secret: z.string().min(16),
  hmacSecret: z.string().nullable().default(null),
});

/* ─── users, sessions, settings ──────────────────────────────────────────── */

export const userDtoSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  fullName: z.string().nullable().default(null),
  nickname: z.string().nullable().default(null),
  phoneNumber: z.string().nullable().default(null),
  country: z.string().nullable().default(null),
  city: z.string().nullable().default(null),
  street: z.string().nullable().default(null),
  postalCode: z.string().nullable().default(null),
  pendingEmail: z.string().email().nullable().default(null),
  createdAt: z.string(),
});

export const updateProfileSchema = z.object({
  fullName: z.string().min(1).max(120).nullable(),
  nickname: z.string().min(1).max(40).nullable().optional(),
  phoneNumber: z.string().min(4).max(40).nullable(),
  country: z.string().min(2).max(2).nullable().optional(),
  city: z.string().min(1).max(80).nullable().optional(),
  street: z.string().min(1).max(160).nullable().optional(),
  postalCode: z.string().min(2).max(20).nullable().optional(),
});

export const requestEmailChangeSchema = z.object({ newEmail: z.string().email() });
export const verifyEmailChangeSchema = z.object({ token: z.string().min(20) });
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(8),
  newPassword: z.string().min(8),
});

export const sessionDtoSchema = z.object({
  id: z.string().min(1),
  authSessionId: z.string().min(1),
  deviceId: z.string().nullable().default(null),
  userAgent: z.string().nullable(),
  ipAddress: z.string().nullable(),
  /** Sign-ins folded into this row: same device, or same IP + user agent. */
  sessionCount: z.number().int().positive().default(1),
  isCurrentDevice: z.boolean().default(false),
  lastSeenAt: z.string(),
  createdAt: z.string(),
});

export const sessionSettingsSchema = z.object({
  london: z.boolean(),
  newYork: z.boolean(),
});

export const notificationChannelPreferencesSchema = z.object({
  email: z.boolean(),
  whatsapp: z.boolean(),
});

export const notificationEventPreferencesSchema = z.object({
  newTradeOpened: z.boolean(),
  tpHit: z.boolean(),
  slHit: z.boolean(),
  lowMargin: z.boolean(),
  eaDisconnected: z.boolean(),
  masterOffline: z.boolean(),
  copyFailed: z.boolean(),
  executionFailed: z.boolean(),
  dailySummary: z.boolean(),
});

export const notificationPreferencesSchema = z.object({
  channels: notificationChannelPreferencesSchema,
  events: notificationEventPreferencesSchema,
});

export const settingsDtoSchema = z.object({
  autoCopyEnabled: z.boolean().default(true),
  executionPaused: z.boolean().default(false),
  executionPauseReason: z.string().nullable().default(null),
  executionPausedAt: z.string().nullable().default(null),
  allowApiTradeOpening: z.boolean().default(false),
  excludedSymbols: z.array(symbolSchema).default([]),
  sessions: sessionSettingsSchema,
  /** Prefilled into every new copier link. */
  copierDefaults: copierRiskParamsSchema,
  notificationChannels: notificationChannelPreferencesSchema,
  notificationEvents: notificationEventPreferencesSchema,
});

/* ─── accounts ───────────────────────────────────────────────────────────── */

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

export const renameAccountSchema = z.object({
  displayName: z.string().min(1).max(60).nullable(),
});

export const accountDtoSchema = z.object({
  id: z.string().min(1),
  externalAccountId: z.string().nullable().optional(),
  name: z.string().min(1),
  displayName: z.string().nullable().default(null),
  broker: z.string().nullable().optional(),
  source: accountSourceSchema.default('EA'),
  role: accountRoleSchema.default('UNASSIGNED'),
  platform: platformSchema.nullable().optional(),
  currency: z.string().nullable().optional(),
  leverage: z.number().int().nullable().optional(),
  hidden: z.boolean().default(false),
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

/* ─── trade api (HTTP, gated by allowApiTradeOpening) ────────────────────── */

export const tradeApiOpenSchema = z
  .object({
    accountId: z.string().min(1),
    symbol: symbolSchema,
    side: orderSideSchema,
    volume: z.number().positive(),
    entry: orderEntrySchema.default('MARKET'),
    entryPrice: z.number().positive().nullable().optional(),
    stopLoss: z.number().positive().nullable().optional(),
    takeProfit: z.number().positive().nullable().optional(),
  })
  .refine(
    (value) =>
      value.entry !== 'MARKET' || value.entryPrice === null || value.entryPrice === undefined,
    { message: 'Market orders must not include an entryPrice', path: ['entryPrice'] },
  )
  .refine((value) => value.entry === 'MARKET' || Boolean(value.entryPrice), {
    message: 'Pending orders require entryPrice',
    path: ['entryPrice'],
  })
  .refine((value) => value.entry !== 'STOP_LIMIT', {
    message: 'STOP_LIMIT orders are not supported by the connected EA yet. Use STOP or LIMIT.',
    path: ['entry'],
  });

export const tradeApiCloseSchema = z
  .object({
    accountId: z.string().min(1),
    ticket: ticketSchema.optional(),
    symbol: symbolSchema.optional(),
    percent: z.number().min(1).max(100).default(100),
  })
  .refine((value) => Boolean(value.ticket || value.symbol), {
    message: 'Provide either ticket or symbol',
    path: ['ticket'],
  });

export const tradeApiModifySchema = z
  .object({
    accountId: z.string().min(1),
    ticket: ticketSchema.optional(),
    symbol: symbolSchema.optional(),
    stopLoss: z.number().positive().nullable().optional(),
    takeProfit: z.number().positive().nullable().optional(),
  })
  .refine((value) => Boolean(value.ticket || value.symbol), {
    message: 'Provide either ticket or symbol',
    path: ['ticket'],
  })
  .refine((value) => value.stopLoss !== undefined || value.takeProfit !== undefined, {
    message: 'Provide stopLoss or takeProfit',
    path: ['stopLoss'],
  });

export const tradeApiCommandResultSchema = z.object({
  requestId: z.string().min(1),
  accountId: z.string().min(1),
  status: z.enum(['DELIVERED', 'ERROR']),
  message: z.string().min(1),
});

/* ─── trade history import ───────────────────────────────────────────────── */

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
  copyEventId: z.string().nullable(),
  accountId: z.string().min(1),
  accountName: z.string().nullable().optional(),
  ticket: z.string().min(1),
  symbol: symbolSchema,
  type: orderSideSchema,
  volume: z.number().positive(),
  entryPrice: z.number(),
  exitPrice: z.number().nullable(),
  stopLoss: z.number().nullable(),
  takeProfit: z.number().nullable(),
  profit: z.number(),
  status: tradeLifecycleStatusSchema,
  entryType: orderEntrySchema.default('MARKET'),
  openingOrderType: orderSideSchema.nullable().optional(),
  detectedTradeType: z.string().nullable().optional(),
  positionDirection: positionDirectionSchema.nullable().optional(),
  closeReason: tradeCloseReasonSchema.nullable().optional(),
  comment: z.string().nullable(),
  openedAt: z.string(),
  closedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/* ─── analytics (unchanged) ──────────────────────────────────────────────── */

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

  metricAvailability: z
    .record(
      z.string(),
      z.object({
        available: z.boolean(),
        reason: z.string().nullable(),
        formula: z.string(),
        source: z.string(),
      }),
    )
    .optional(),
  assumptions: z.array(z.string()),
  dataSufficiency: z.object({
    sufficient: z.boolean(),
    reason: z.string().nullable(),
    minimumTradeCount: z.number().int().positive(),
    observedTradeCount: z.number().int().nonnegative(),
  }),
});

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

/* ─── economic calendar ──────────────────────────────────────────────────── */

export const newsImpactSchema = z.enum(['HIGH', 'MEDIUM', 'LOW', 'HOLIDAY']);
export const newsRangeSchema = z.enum(['lastweek', 'thisweek', 'nextweek']);

export const economicEventSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  currency: z.string().min(2).max(6),
  impact: newsImpactSchema,
  /** ISO instant; the client renders it in the viewer's timezone. */
  date: z.string(),
  /** True when the source gave a day without a usable time (All Day, Tentative). */
  allDay: z.boolean().default(false),
  forecast: z.string().nullable().default(null),
  previous: z.string().nullable().default(null),
  actual: z.string().nullable().default(null),
});

export const economicCalendarSchema = z.object({
  range: newsRangeSchema,
  fetchedAt: z.string(),
  events: z.array(economicEventSchema),
});

export const economicIndicatorPointSchema = z.object({
  date: z.string(),
  actual: z.number(),
});

export const economicIndicatorDetailSchema = z.object({
  title: z.string(),
  source: z.string(),
  sourceUrl: z.string().url(),
  measures: z.string(),
  frequency: z.string(),
  whyItMatters: z.string(),
  history: z.array(economicIndicatorPointSchema),
  unit: z.string(),
});

export type NewsImpact = z.infer<typeof newsImpactSchema>;
export type NewsRange = z.infer<typeof newsRangeSchema>;
export type EconomicEventDTO = z.infer<typeof economicEventSchema>;
export type EconomicCalendarDTO = z.infer<typeof economicCalendarSchema>;
export type EconomicIndicatorDetailDTO = z.infer<typeof economicIndicatorDetailSchema>;

/* ─── commitments of traders ─────────────────────────────────────────────── */

export const cotReportModeSchema = z.enum(['futures', 'combined']);

/**
 * The CFTC publishes the same positions under three trader taxonomies. Legacy
 * exists for every market; physical commodities also get `disaggregated` and
 * financial futures get `financial`.
 */
export const cotTableKindSchema = z.enum(['legacy', 'disaggregated', 'financial']);
export const cotBiasSchema = z.enum(['LONG', 'SHORT', 'FLAT']);

export const cotMarketSchema = z.object({
  /** CFTC contract market code — the stable join key across releases. */
  code: z.string().min(1),
  label: z.string().min(1),
  group: z.string().min(1),
  exchange: z.string().min(1),
  contractUnit: z.string(),
  /** The chart symbol traders know this contract by, when there is one. */
  symbol: z.string().nullable().default(null),
});

export const cotCellSchema = z.object({
  positions: z.number(),
  change: z.number(),
  pctOi: z.number(),
  /** Null where the CFTC does not break traders out, as for nonreportables. */
  traders: z.number().nullable().default(null),
});

export const cotCategorySchema = z.object({
  key: z.string(),
  label: z.string(),
  long: cotCellSchema,
  short: cotCellSchema,
  /** Null for categories the CFTC does not publish a spreading column for. */
  spreading: cotCellSchema.nullable().default(null),
});

export const cotTableSchema = z.object({
  kind: cotTableKindSchema,
  label: z.string(),
  categories: z.array(cotCategorySchema),
});

/**
 * The speculative bucket pulled to the top of the page: Managed Money for
 * commodities, Leveraged Funds for financials, Non-Commercial as the fallback.
 */
export const cotSpeculatorSummarySchema = z.object({
  label: z.string(),
  long: z.number(),
  short: z.number(),
  net: z.number(),
  netChange: z.number(),
  longChange: z.number(),
  shortChange: z.number(),
  /** Null when nothing is held short, which would divide by zero. */
  longShortRatio: z.number().nullable(),
  netPctOi: z.number(),
  bias: cotBiasSchema,
});

export const cotReportSchema = z.object({
  market: cotMarketSchema,
  mode: cotReportModeSchema,
  reportDate: z.string(),
  /** The Tuesday the change columns are measured against. */
  previousDate: z.string(),
  openInterest: z.number(),
  openInterestChange: z.number(),
  totalTraders: z.number().nullable().default(null),
  tables: z.array(cotTableSchema),
  speculators: cotSpeculatorSummarySchema,
  fetchedAt: z.string(),
});

export const cotMarketListSchema = z.object({
  markets: z.array(cotMarketSchema),
});

export const cotHistoryPointSchema = z.object({
  reportDate: z.string(),
  openInterest: z.number(),
  /** Managed Money or Leveraged Funds, whichever covers this market. */
  specLong: z.number(),
  specShort: z.number(),
  specNet: z.number(),
  nonCommercialLong: z.number(),
  nonCommercialShort: z.number(),
  nonCommercialNet: z.number(),
  commercialLong: z.number(),
  commercialShort: z.number(),
  commercialNet: z.number(),
  nonReportableLong: z.number(),
  nonReportableShort: z.number(),
  nonReportableNet: z.number(),
});

/**
 * The COT Index: where the current net position sits inside its own range over
 * a lookback, 0 being the most bearish that window has seen and 100 the most
 * bullish. Null when the window is flat or too short to be meaningful.
 */
export const cotIndexWindowSchema = z.object({
  weeks: z.number(),
  sampleWeeks: z.number(),
  value: z.number().nullable(),
  min: z.number(),
  max: z.number(),
});

export const cotHistorySchema = z.object({
  market: cotMarketSchema,
  mode: cotReportModeSchema,
  speculatorLabel: z.string(),
  points: z.array(cotHistoryPointSchema),
  indexes: z.array(cotIndexWindowSchema),
  fetchedAt: z.string(),
});

export const cotAiBiasSchema = z.enum(['BULLISH', 'BEARISH', 'NEUTRAL']);
export const cotAiStrengthSchema = z.enum(['LOW', 'MEDIUM', 'HIGH']);

export const cotAiSignalSchema = z.object({
  category: z.enum(['POSITIONING', 'MOMENTUM', 'EXTREME', 'COMMERCIALS', 'RISK']),
  title: z.string().min(1).max(70),
  bias: cotAiBiasSchema,
  strength: cotAiStrengthSchema,
  metric: z.string().min(1).max(90),
  insight: z.string().min(1).max(220),
});

export const cotAiAnalysisSchema = z.object({
  marketCode: z.string().min(1),
  reportDate: z.string(),
  model: z.string(),
  overall: z.object({
    bias: cotAiBiasSchema,
    conviction: z.number().int().min(0).max(100),
    title: z.string().min(1).max(80),
    summary: z.string().min(1).max(240),
  }),
  signals: z.array(cotAiSignalSchema).min(4).max(6),
  disclaimer: z.string().min(1).max(180),
  generatedAt: z.string(),
});

export type CotReportMode = z.infer<typeof cotReportModeSchema>;
export type CotTableKind = z.infer<typeof cotTableKindSchema>;
export type CotBias = z.infer<typeof cotBiasSchema>;
export type CotMarketDTO = z.infer<typeof cotMarketSchema>;
export type CotCellDTO = z.infer<typeof cotCellSchema>;
export type CotCategoryDTO = z.infer<typeof cotCategorySchema>;
export type CotTableDTO = z.infer<typeof cotTableSchema>;
export type CotSpeculatorSummaryDTO = z.infer<typeof cotSpeculatorSummarySchema>;
export type CotReportDTO = z.infer<typeof cotReportSchema>;
export type CotMarketListDTO = z.infer<typeof cotMarketListSchema>;
export type CotHistoryPointDTO = z.infer<typeof cotHistoryPointSchema>;
export type CotIndexWindowDTO = z.infer<typeof cotIndexWindowSchema>;
export type CotHistoryDTO = z.infer<typeof cotHistorySchema>;
export type CotAiBias = z.infer<typeof cotAiBiasSchema>;
export type CotAiStrength = z.infer<typeof cotAiStrengthSchema>;
export type CotAiSignalDTO = z.infer<typeof cotAiSignalSchema>;
export type CotAiAnalysisDTO = z.infer<typeof cotAiAnalysisSchema>;

/* ─── execution logs ─────────────────────────────────────────────────────── */

export const executionStatusSchema = z.enum([
  'RECEIVED',
  'RETRYING',
  'DISPATCHED',
  'COPY_SENT',
  'COPY_SKIPPED',
  'COPY_FILLED',
  'COPY_REJECTED',
  'SYMBOL_MAPPED',
  'SYMBOL_MAPPING_FAILED',
  'EA_OFFLINE',
  'MASTER_OFFLINE',
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
  'API_TRADE_REQUESTED',
  'API_TRADE_BLOCKED',
]);

export const executionLogSchema = z.object({
  id: z.string().min(1),
  copyEventId: z.string().nullable(),
  accountId: z.string().nullable().optional(),
  accountName: z.string().nullable().optional(),
  executionKey: z.string().nullable().optional(),
  attempt: z.number().int().min(0),
  status: executionStatusSchema,
  message: z.string(),
  details: z.record(z.string(), z.unknown()).nullable().optional(),
  createdAt: z.string(),
});

/* ─── dashboard ──────────────────────────────────────────────────────────── */

export const copierOverviewSchema = z.object({
  masterAccountId: z.string().nullable(),
  masterAccountName: z.string().nullable(),
  masterOnline: z.boolean(),
  totalLinks: z.number().int().nonnegative(),
  activeLinks: z.number().int().nonnegative(),
  slavesOnline: z.number().int().nonnegative(),
  copyEventsToday: z.number().int().nonnegative(),
  copiesFilledToday: z.number().int().nonnegative(),
  copiesSkippedToday: z.number().int().nonnegative(),
  copiesFailedToday: z.number().int().nonnegative(),
  copySuccessRate: z.number().min(0).max(100).nullable(),
  lastCopyAt: z.string().nullable(),
});

export const dashboardOverviewSchema = z.object({
  eaOnline: z.boolean(),
  eaLatencyMs: z.number().int().nonnegative().nullable(),
  eaLastSeenAt: z.string().nullable(),
  accountStatus: accountStatusDtoSchema.nullable(),
  connectedAccounts: z.array(accountDtoSchema),
  copier: copierOverviewSchema,
  recentCopyEvents: z.array(copyEventSchema),
  recentExecutionLogs: z.array(executionLogSchema),
  recentTrades: z.array(tradeExecutionDtoSchema),
  analytics: analyticsSummarySchema,
  tradingEngine: z.object({
    autoCopyEnabled: z.boolean(),
    executionPaused: z.boolean(),
    executionPauseReason: z.string().nullable(),
    allowApiTradeOpening: z.boolean(),
    riskStatus: z.enum(['OK', 'LIMIT_HIT', 'PAUSED']),
    connectedAccounts: z.number().int().nonnegative(),
    lastTradeAt: z.string().nullable(),
  }),
});

/* ─── EA websocket protocol ──────────────────────────────────────────────── */
/*
  Wire field names are frozen: they are parsed by the compiled MQL4/MQL5
  advisors in the field. `signal_id` now carries a copy event id, and
  `execution_key` correlates a fill back to its copy_orders row.
*/

export const eaAuthMessageSchema = z.object({
  type: z.literal('auth'),
  apiKey: z.string().min(16),
  accountId: z.string().min(1),
  accountName: z.string().min(1),
  platform: platformSchema.optional(),
  currency: z.string().max(8).optional(),
  leverage: z.number().int().positive().optional(),
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
  ticket: ticketSchema,
  signal_id: z.string().optional().nullable(),
  symbol: symbolSchema,
  type: orderSideSchema,
  opening_order_type: orderSideSchema.nullable().optional(),
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
  action: z.enum(['OPEN', 'PARTIAL_CLOSE', 'CLOSE_ALL', 'MOVE_SL']),
  symbol: symbolSchema.nullable().optional(),
  status: commandResultStatusSchema,
  message: z.string().min(1),
  ticket: ticketSchema.nullable().optional(),
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

export const eaAuthSuccessMessageSchema = z.object({ type: z.literal('auth_success') });

export const eaErrorMessageSchema = z.object({
  type: z.literal('error'),
  message: z.string().min(1),
});

export const eaTradePayloadSchema = z.object({
  symbol: z.string().min(2),
  type: orderSideSchema,
  entry: orderEntrySchema,
  volume: z.number().positive().optional(),
  entry_price: z.number().positive().nullable(),
  stop_loss: z.number().positive().nullable(),
  take_profit: z.number().positive().nullable(),
  signal_id: z.string().min(1).optional(),
  execution_key: z.string().min(1).optional(),
});

export const eaSignalMessageSchema = z.object({
  type: z.literal('signal'),
  data: z.array(eaTradePayloadSchema).min(1),
});

export const eaPartialCloseMessageSchema = z.object({
  type: z.literal('partial_close'),
  symbol: symbolSchema.optional(),
  ticket: ticketSchema.optional(),
  percent: z.number().min(1).max(100),
  signal_id: z.string().nullable().optional(),
  execution_key: z.string().nullable().optional(),
});

export const eaCloseAllMessageSchema = z.object({
  type: z.literal('close_all'),
  symbol: symbolSchema.optional(),
  ticket: ticketSchema.optional(),
  signal_id: z.string().nullable().optional(),
  execution_key: z.string().nullable().optional(),
});

export const eaMoveSlMessageSchema = z.object({
  type: z.literal('move_sl'),
  symbol: symbolSchema.optional(),
  ticket: ticketSchema.optional(),
  new_stop_loss: z.number().positive().nullable().optional(),
  new_take_profit: z.number().positive().nullable().optional(),
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
  eaSyncStateCompleteMessageSchema,
]);

export const eaOutboundMessageSchema = z.discriminatedUnion('type', [
  eaAuthSuccessMessageSchema,
  eaPingMessageSchema,
  eaPongMessageSchema,
  eaErrorMessageSchema,
  eaSyncStateMessageSchema,
  eaSignalMessageSchema,
  eaPartialCloseMessageSchema,
  eaCloseAllMessageSchema,
  eaMoveSlMessageSchema,
]);

/* ─── types ──────────────────────────────────────────────────────────────── */

export type OrderSide = z.infer<typeof orderSideSchema>;
export type OrderEntry = z.infer<typeof orderEntrySchema>;
export type PositionDirection = z.infer<typeof positionDirectionSchema>;
export type TradeCloseReason = z.infer<typeof tradeCloseReasonSchema>;
export type AccountRole = z.infer<typeof accountRoleSchema>;
export type Platform = z.infer<typeof platformSchema>;

export type SizingMode = z.infer<typeof sizingModeSchema>;
export type SymbolFilterMode = z.infer<typeof symbolFilterModeSchema>;
export type CopyAction = z.infer<typeof copyActionSchema>;
export type CopyOrderStatus = z.infer<typeof copyOrderStatusSchema>;
export type CopierRiskParams = z.infer<typeof copierRiskParamsSchema>;
export type CopierLinkDTO = z.infer<typeof copierLinkSchema>;
export type CreateCopierLinkInput = z.infer<typeof createCopierLinkSchema>;
export type UpdateCopierLinkInput = z.infer<typeof updateCopierLinkSchema>;
export type SetMasterAccountInput = z.infer<typeof setMasterAccountSchema>;
export type CopyEventDTO = z.infer<typeof copyEventSchema>;
export type CopyOrderDTO = z.infer<typeof copyOrderSchema>;
export type CopierOverviewDTO = z.infer<typeof copierOverviewSchema>;

export type ApiKeyKind = z.infer<typeof apiKeyKindSchema>;
export type ApiKeyDTO = z.infer<typeof apiKeySchema>;
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
export type RotateApiKeyInput = z.infer<typeof rotateApiKeySchema>;
export type ApiKeySecretResult = z.infer<typeof apiKeySecretResultSchema>;

export type UserDTO = z.infer<typeof userDtoSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type RequestEmailChangeInput = z.infer<typeof requestEmailChangeSchema>;
export type VerifyEmailChangeInput = z.infer<typeof verifyEmailChangeSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type UserSessionDTO = z.infer<typeof sessionDtoSchema>;
export type SettingsDTO = z.infer<typeof settingsDtoSchema>;
export type NotificationPreferencesDTO = z.infer<typeof notificationPreferencesSchema>;

export type AccountDTO = z.infer<typeof accountDtoSchema>;
export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type RenameAccountInput = z.infer<typeof renameAccountSchema>;
export type AccountStatusDTO = z.infer<typeof accountStatusDtoSchema>;

export type TradeApiOpenInput = z.infer<typeof tradeApiOpenSchema>;
export type TradeApiCloseInput = z.infer<typeof tradeApiCloseSchema>;
export type TradeApiModifyInput = z.infer<typeof tradeApiModifySchema>;
export type TradeApiCommandResult = z.infer<typeof tradeApiCommandResultSchema>;

export type TradeHistoryFileDTO = z.infer<typeof tradeHistoryFileDtoSchema>;
export type TradeExecutionDTO = z.infer<typeof tradeExecutionDtoSchema>;
export type AnalyticsSummaryDTO = z.infer<typeof analyticsSummarySchema>;
export type SymbolBreakdownDTO = z.infer<typeof symbolBreakdownSchema>;
export type DirectionBreakdownDTO = z.infer<typeof directionBreakdownSchema>;
export type PeriodBreakdownDTO = z.infer<typeof periodBreakdownSchema>;
export type TradeTypeBreakdownDTO = z.infer<typeof tradeTypeBreakdownSchema>;
export type BestWorstPeriodDTO = z.infer<typeof bestWorstPeriodSchema>;
export type EquityCurvePointDTO = z.infer<typeof equityCurvePointSchema>;
export type DailyTradeSummaryItem = z.infer<typeof dailyTradeSummaryItemSchema>;
export type DailyTradeSummaryDTO = z.infer<typeof dailyTradeSummarySchema>;

export type ExecutionStatus = z.infer<typeof executionStatusSchema>;
export type ExecutionLogDTO = z.infer<typeof executionLogSchema>;
export type DashboardOverviewDTO = z.infer<typeof dashboardOverviewSchema>;

export type WebSocketInboundMessage = z.infer<typeof eaInboundMessageSchema>;
export type WebSocketOutboundMessage = z.infer<typeof eaOutboundMessageSchema>;
export type EaAccountStatusPayload = z.infer<typeof eaAccountStatusPayloadSchema>;
export type EaTradeEventPayload = z.infer<typeof eaTradeEventPayloadSchema>;
export type EaTradePayload = z.infer<typeof eaTradePayloadSchema>;
export type EaCommandResultStatus = z.infer<typeof commandResultStatusSchema>;
