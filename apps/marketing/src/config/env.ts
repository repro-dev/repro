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

export function createEnv(values: unknown) {
  return envSchema.parse(values)
}
