import { z } from 'zod';

export const signalSideSchema = z.enum(['BUY', 'SELL']);

export const signalDtoSchema = z.object({
  symbol: z.string().min(3).max(20).transform((value) => value.toUpperCase()),
  type: signalSideSchema,
  entry: z.union([z.literal('MARKET'), z.number().positive()]),
  stopLoss: z.number().positive(),
  takeProfits: z.array(z.number().positive()).min(1),
  sourceChannel: z.string().min(1).optional(),
  confidence: z.number().min(0).max(1).optional(),
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
  allowedSymbols: z.array(z.string().min(3)).min(1),
  sessions: sessionSettingsSchema,
});

export const accountDtoSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  broker: z.string().min(1),
  createdAt: z.string(),
});

export const createAccountSchema = z.object({
  name: z.string().min(1).max(50),
  broker: z.string().min(1).max(50),
});

export const telegramChannelSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  enabled: z.boolean(),
});

export const simulateTelegramSignalSchema = z.object({
  channelId: z.string().min(1),
  rawMessage: z.string().min(10),
});

export const signalStatusSchema = z.enum([
  'PENDING',
  'VALIDATED',
  'DISPATCHED',
  'FAILED',
]);

export const signalRecordSchema = z.object({
  id: z.string().min(1),
  rawMessage: z.string().min(1),
  sourceChannel: z.string().nullable().optional(),
  parsedData: signalDtoSchema.nullable(),
  status: signalStatusSchema,
  createdAt: z.string(),
});

export const executionStatusSchema = z.enum([
  'RECEIVED',
  'DISPATCHED',
  'RETRIED',
  'FAILED',
]);

export const executionLogSchema = z.object({
  id: z.string().min(1),
  signalId: z.string().nullable(),
  status: executionStatusSchema,
  message: z.string(),
  createdAt: z.string(),
});

export const dashboardOverviewSchema = z.object({
  eaConnected: z.boolean(),
  recentSignals: z.array(signalRecordSchema),
  recentExecutionLogs: z.array(executionLogSchema),
});

export const eaAuthMessageSchema = z.object({
  type: z.literal('auth'),
  apiKey: z.string().min(16),
});

export const eaPingMessageSchema = z.object({
  type: z.literal('ping'),
});

export const eaPongMessageSchema = z.object({
  type: z.literal('pong'),
});

export const eaAuthSuccessMessageSchema = z.object({
  type: z.literal('auth_success'),
});

export const eaErrorMessageSchema = z.object({
  type: z.literal('error'),
  message: z.string().min(1),
});

export const eaSignalPayloadSchema = z.object({
  symbol: z.string().min(3),
  type: signalSideSchema,
  entry: z.union([z.literal('MARKET'), z.number().positive()]),
  stop_loss: z.number().positive(),
  take_profits: z.array(z.number().positive()).min(1),
});

export const eaSignalMessageSchema = z.object({
  type: z.literal('signal'),
  data: eaSignalPayloadSchema,
});

export const eaInboundMessageSchema = z.discriminatedUnion('type', [
  eaAuthMessageSchema,
  eaPingMessageSchema,
]);

export const eaOutboundMessageSchema = z.discriminatedUnion('type', [
  eaAuthSuccessMessageSchema,
  eaPongMessageSchema,
  eaErrorMessageSchema,
  eaSignalMessageSchema,
]);

export type SignalDTO = z.infer<typeof signalDtoSchema>;
export type UserDTO = z.infer<typeof userDtoSchema>;
export type SettingsDTO = z.infer<typeof settingsDtoSchema>;
export type AccountDTO = z.infer<typeof accountDtoSchema>;
export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type TelegramChannelDTO = z.infer<typeof telegramChannelSchema>;
export type SimulateTelegramSignalInput = z.infer<typeof simulateTelegramSignalSchema>;
export type SignalRecordDTO = z.infer<typeof signalRecordSchema>;
export type ExecutionLogDTO = z.infer<typeof executionLogSchema>;
export type DashboardOverviewDTO = z.infer<typeof dashboardOverviewSchema>;
export type WebSocketInboundMessage = z.infer<typeof eaInboundMessageSchema>;
export type WebSocketOutboundMessage = z.infer<typeof eaOutboundMessageSchema>;
export type EaSignalPayload = z.infer<typeof eaSignalPayloadSchema>;
