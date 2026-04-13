import z from 'zod'

const envSchema = z.object({
  BUILD_ENV: z.string().default('development'),
  MIXPANEL_TOKEN: z.string().default(''),
  PADDLE_CLIENT_TOKEN: z.string().default(''),
  PADDLE_ENVIRONMENT: z.enum(['sandbox', 'production']).default('sandbox'),
  REPRO_API_URL: z.string().default('https://localhost:8181'),
  REPRO_APP_URL: z.string().default('https://localhost:8080'),
})

export type Env = z.infer<typeof envSchema>

type Replacer = {
  replace<K extends keyof Env>(key: K, value: Env[K]): () => void
}

export function createEnv(values: Record<string, unknown>): Env & Replacer {
  const parsed = envSchema.parse(values)

  const result: Env & Replacer = Object.assign(parsed, {
    replace<K extends keyof Env>(key: K, value: Env[K]) {
      const original = parsed[key]
      parsed[key] = envSchema.shape[key].parse(value) as Env[K]
      return () => {
        parsed[key] = original
      }
    },
  })

  return result
}
