import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

// Real deployments inject env vars directly (Docker Compose / Railway); this
// only helps when running the backend straight from the host.
loadDotenv({ quiet: true });

const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value === '' ? undefined : value));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatoria'),

  // No default: an accidentally missing secret must break the boot, never
  // silently fall back to a well-known value.
  JWT_SECRET: z.string().min(16, 'JWT_SECRET debe tener al menos 16 caracteres'),

  APP_URL: z.string().url().default('http://localhost:5173'),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),

  SENTRY_DSN: optionalString,
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .optional(),

  WHATSAPP_MODE: z.enum(['cli', 'baileys']).default('cli'),
  WHATSAPP_GROUP_ID: z.string().default(''),
  WA_LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('warn'),

  BREB_KEY: z.string().default('@MLR608'),
});

export type Env = z.infer<typeof envSchema>;

function parseEnv(source: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Variables de entorno inválidas:\n${details}`);
  }

  return result.data;
}

export const env: Env = parseEnv(process.env);

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

export { envSchema, parseEnv };
