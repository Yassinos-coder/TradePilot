import { z } from 'zod';

const rawServerEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().optional(),
  API_PORT: z.coerce.number().optional(),
  ALLOWED_ORIGINS: z.string().optional(),
  CORS_ORIGIN: z.string().optional(),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  SUPABASE_SCHEMA: z.string().min(1).default('tradepilot'),
  REDIS_URL: z.string().min(1),
  DISPATCH_RETRY_COUNT: z.coerce.number().int().min(1).max(10).default(3),
  DISPATCH_RETRY_DELAY_MS: z.coerce.number().int().min(100).default(750),
  EA_HEARTBEAT_TIMEOUT_MS: z.coerce.number().int().min(1000).default(30000),
  EA_SERVER_PING_INTERVAL_MS: z.coerce.number().int().min(1000).default(10000),
  EA_PRESENCE_TTL_MS: z.coerce.number().int().min(1000).default(45000),
  EA_DISPATCH_ACK_TIMEOUT_MS: z.coerce.number().int().min(250).default(2000),
  GUARD_MAX_TRADES_PER_SYMBOL: z.coerce.number().int().min(1).max(20).default(1),
  GUARD_SYMBOL_COOLDOWN_MS: z.coerce.number().int().min(0).default(3000),
  GUARD_DUPLICATE_SIGNAL_WINDOW_MS: z.coerce.number().int().min(0).default(60000),
  GUARD_ACTIVE_SIGNAL_WINDOW_MS: z.coerce.number().int().min(1000).default(900000),
});

export const serverEnvSchema = rawServerEnvSchema.transform((environment) => ({
  ...environment,
  API_PORT: environment.API_PORT ?? environment.PORT ?? 4000,
  CORS_ORIGIN:
    environment.CORS_ORIGIN ??
    environment.ALLOWED_ORIGINS ??
    'http://localhost:8080,http://localhost:5173,http://127.0.0.1:5173',
}));

export const clientEnvSchema = z.object({
  VITE_API_BASE_URL: z.string().default('http://localhost:4000/api'),
  VITE_WS_BASE_URL: z.string().default('ws://localhost:4000'),
  VITE_SUPABASE_URL: z.string().url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(1),
  VITE_MAGIC_LINK_REDIRECT_PATH: z.string().default('/auth/callback'),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type ClientEnv = z.infer<typeof clientEnvSchema>;

export function parseServerEnv(input: Record<string, unknown>): ServerEnv {
  return serverEnvSchema.parse(input);
}

export function parseClientEnv(input: Record<string, unknown>): ClientEnv {
  return clientEnvSchema.parse(input);
}
