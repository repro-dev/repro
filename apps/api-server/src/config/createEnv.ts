import z from 'zod'

const numericStringTransform = z.preprocess(val => {
  if (typeof val === 'string') {
    return parseInt(val, 10)
  }

  if (typeof val === 'number') {
    return val
  }

  return undefined
}, z.number())

const booleanStringTransform = z.preprocess(val => {
  if (typeof val === 'string') {
    return val === 'true'
  }

  if (typeof val === 'boolean') {
    return val
  }

  return undefined
}, z.boolean())

const positiveIntegerStringTransform = z.preprocess(val => {
  if (typeof val === 'string') {
    return parseInt(val, 10)
  }

  if (typeof val === 'number') {
    return val
  }

  return undefined
}, z.number().int().min(1))

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  HOST: z.string().default('localhost'),
  PORT: numericStringTransform.default(8080),
  DB_HOST: z.string().default('localhost'),
  DB_PORT: numericStringTransform.default(15432),
  DB_NAME: z.string().default('repro'),
  DB_USER: z.string().default('repro'),
  DB_PASSWORD: z.string().default('repro'),
  DB_SSL: booleanStringTransform.default(false),
  OPENROUTER_API_KEY: z.string().default('this-is-a-private-api-key'),
  STORAGE_ENDPOINT: z.string().default('http://localhost:18333'),
  STORAGE_REGION: z.string().default('us-east-1'),
  STORAGE_BUCKET: z.string().default('repro'),
  STORAGE_ACCESS_KEY_ID: z.string().default('repro'),
  STORAGE_SECRET_ACCESS_KEY: z.string().default('repro'),
  SESSION_SECRET: z.string().default('this-is-a-session-secret'),
  SESSION_COOKIE: z.string().default('sessid'),
  SESSION_SOFT_EXPIRY: numericStringTransform.default(3600),
  SESSION_HARD_EXPIRY: numericStringTransform.default(28 * 24 * 3600),
  SESSION_CLEANUP_INTERVAL: positiveIntegerStringTransform.default(3600),
  PADDLE_API_KEY: z.string().optional(),
  PADDLE_CLIENT_TOKEN: z.string().optional(),
  PADDLE_WEBHOOK_SECRET: z.string().optional(),
  PADDLE_ENVIRONMENT: z.enum(['sandbox', 'production']).default('sandbox'),
  BILLING_DEFAULT_PLAN: z.string().default('Free'),
  BILLING_STUBBED: booleanStringTransform.default(true),
  DEBUG: z.string().optional(),
  AGENTIC_MAX_ITERATIONS: z.coerce.number().default(25),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM_ADDRESS: z.string().default('noreply@repro.dev'),
  APP_BASE_URL: z.string().default('http://localhost:3000'),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  REPRO_APP_URL: z.string().default('http://localhost:3000'),
  REPRO_ADMIN_URL: z.string().default('http://localhost:3001'),
  REPRO_API_URL: z.string().default('http://localhost:8080'),
  RATE_LIMIT_UNAUTHENTICATED_RPM: numericStringTransform.default(60),
  RATE_LIMIT_AUTHENTICATED_RPM: numericStringTransform.default(600),
  RATE_LIMIT_UPLOAD_RPM: numericStringTransform.default(20),
  RATE_LIMIT_REDIS_URL: z.string().optional(),
  AGENTIC_RATE_LIMIT_PER_HOUR: z.coerce.number().default(60),
  AGENTIC_MAX_MESSAGES_PER_RECORDING: z.coerce.number().default(200),
  OUTBOX_WORKER_POLL_INTERVAL_MS: positiveIntegerStringTransform.default(1000),
  OUTBOX_WORKER_BATCH_SIZE: positiveIntegerStringTransform.default(10),
  OUTBOX_WORKER_DEFAULT_MAX_ATTEMPTS: positiveIntegerStringTransform.default(3),
  OUTBOX_WORKER_RETRY_BASE_MS: positiveIntegerStringTransform.default(1000),
  OUTBOX_WORKER_RETRY_MAX_MS: positiveIntegerStringTransform.default(60000),
  OUTBOX_WORKER_STALE_AFTER_MS: positiveIntegerStringTransform.default(300000),
})

export type Env = z.infer<typeof envSchema>

type Replacer = {
  replace<K extends keyof Env>(key: K, value: Env[K]): () => void
}

export function createEnv(
  values: Record<string, unknown> = process.env
): Env & Replacer {
  const env = envSchema.parse(values) as Env & Replacer

  env.replace = function replace<K extends keyof Env>(key: K, value: Env[K]) {
    const original = env[key]
    // @ts-expect-error
    env[key] = envSchema.shape[key].parse(value) as Env[K]
    return () => {
      env[key] = original
    }
  }

  return env
}
