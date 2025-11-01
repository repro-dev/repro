import z from 'zod'

const envSchema = z.object({
  BUILD_ENV: z.string().default('development'),
  REPRO_API_URL: z.string().default('https://localhost:8181'),
  REPRO_APP_URL: z.string().default('https://localhost:8080'),
})

export type Env = z.infer<typeof envSchema>

type Replacer = {
  replace<K extends keyof Env>(key: K, value: Env[K]): () => void
}

export function createEnv(values: Record<string, unknown>): Env & Replacer {
  const env = envSchema.parse(values) as Env & Replacer

  env.replace = function replace<K extends keyof Env>(key: K, value: Env[K]) {
    const original = env[key]
    env[key] = envSchema.shape[key].parse(value) as Env[K]
    return () => {
      env[key] = original
    }
  }

  return env
}
