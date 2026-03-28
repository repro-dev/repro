import z from 'zod'

// Runtime env schema — validated at startup. Values are provided
// by infra/services.json (serve_env) in development and by the
// deployment environment in production.
const envSchema = z.object({
  BUILD_ENV: z
    .enum(['development', 'testing', 'production'])
    .default('production'),
  REPRO_APP_URL: z.string().url().default('https://app.repro.dev'),
  REPRO_MARKETING_URL: z.string().url().default('https://repro.dev'),
})

export function createEnv(values: Record<string, unknown>) {
  return envSchema.parse(values)
}

export const defaultEnv = createEnv({
  BUILD_ENV: process.env.BUILD_ENV,
  REPRO_APP_URL: process.env.REPRO_APP_URL,
  REPRO_MARKETING_URL: process.env.REPRO_MARKETING_URL,
})
