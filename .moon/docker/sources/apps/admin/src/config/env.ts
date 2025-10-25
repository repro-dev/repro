import z from 'zod'

const envSchema = z.object({
  BUILD_ENV: z.enum(['development', 'testing', 'production']),
  REPRO_WORKSPACE_URL: z.string().url(),
  REPRO_ADMIN_URL: z.string().url(),
  REPRO_API_URL: z.string().url(),
})

export function createEnv(values: Record<string, unknown>) {
  return envSchema.parse(values)
}

export const defaultEnv = createEnv({
  BUILD_ENV: process.env.BUILD_ENV,
  REPRO_WORKSPACE_URL: process.env.REPRO_WORKSPACE_URL,
  REPRO_ADMIN_URL: process.env.REPRO_ADMIN_URL,
  REPRO_API_URL: process.env.REPRO_API_URL,
})
