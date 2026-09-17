import { z } from 'zod';

const rawServerEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().optional(),
  API_PORT: z.coerce.number().optional(),
  ALLOWED_ORIGINS: z.string().optional(),
  CORS_ORIGIN: z.string().optional(),

  // Retained for the analytics AI coach only — no signal parsing uses it.
  OPENAI_API_KEY: z.string().min(20).optional(),
  LLM_MODEL: z.string().min(1).default('gpt-4.1'),
  LLM_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.1),

  NVIDIA_API_KEY: z.string().min(20).optional(),
  NVIDIA_MODEL: z.string().min(1).default('nvidia/nemotron-3.5-lightning-30b-a3b'),

  CENSUS_API_KEY: z.string().min(20).optional(),

  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  SUPABASE_SCHEMA: z.string().min(1).default('tradepilot'),
  PUBLIC_APP_URL: z.string().url().default('http://localhost:8080'),

  REDIS_URL: z.string().min(1),

  // Bull Board stays disabled unless both credentials are configured.
  BULL_BOARD_USERNAME: z.string().min(1).optional(),
  BULL_BOARD_PASSWORD: z.string().min(16).optional(),

  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASSWORD: z.string().min(1).optional(),
  SMTP_FROM: z.string().email().optional(),

  DISPATCH_RETRY_COUNT: z.coerce.number().int().min(1).max(10).default(3),
  DISPATCH_RETRY_DELAY_MS: z.coerce.number().int().min(100).default(750),

  EA_HEARTBEAT_TIMEOUT_MS: z.coerce.number().int().min(1000).default(12000),
  EA_SERVER_PING_INTERVAL_MS: z.coerce.number().int().min(1000).default(5000),
  EA_PRESENCE_TTL_MS: z.coerce.number().int().min(1000).default(18000),
  EA_DISPATCH_ACK_TIMEOUT_MS: z.coerce.number().int().min(250).default(2000),

  API_KEY_ROTATION_GRACE_HOURS: z.coerce.number().int().min(0).max(720).default(24),
  API_KEY_LAST_USED_THROTTLE_MS: z.coerce.number().int().min(0).default(60000),

  RISK_MIN_TRADES_FOR_ADVANCED_METRICS: z.coerce.number().int().min(5).default(30),

  TRADEPILOT_ANALYTICS_READ_TOKEN: z.string().min(20).optional(),
  TRADEPILOT_ANALYTICS_USER_ID: z.string().uuid().optional(),
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
  VITE_API_BASE_URL: z.string().default('/api'),
  VITE_WS_BASE_URL: z.string().default('auto'),
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
