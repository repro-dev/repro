import * as Sentry from '@sentry/node'

import { Env } from '~/config/createEnv'

// Initialise Sentry when a DSN is provided. No-op in environments without one.
export function initSentry(env: Pick<Env, 'SENTRY_DSN'>) {
  if (!env.SENTRY_DSN) return

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: 0,
  })
}
