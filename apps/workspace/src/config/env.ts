import { createEnv } from './createEnv'
export const defaultEnv = createEnv(window.__REPRO_ENV ?? {})
