import z from 'zod'
import { createApiClient } from './src/index'

const env = z
  .object({
    API_URL: z.string().url().default('http://localhost:8181'),
    AUTH_STORAGE: z.enum(['memory', 'local-storage']).default('memory'),
  })
  .parse(process.env)

global.ReproApi = createApiClient({
  baseUrl: env.API_URL,
  authStorage: env.AUTH_STORAGE,
})
