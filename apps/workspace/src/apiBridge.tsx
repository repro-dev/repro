import { TrackedEvent } from '@repro/analytics'
import { createApiClient } from '@repro/api-client'
import { Fetch } from '@repro/api-client/src/types'
import { logger } from '@repro/logger'
import { createMessagingAgent } from '@repro/messaging'
import { resolve } from 'fluture'
import { defaultEnv as env } from '~/config/env'

const apiClient = createApiClient({
  baseUrl: env.REPRO_API_URL ?? '',
  authStorage: 'memory',
})

const agent = createMessagingAgent({
  name: 'apiBridge',
})

agent.subscribeToIntent(
  'api-client:fetch',
  (payload: { args: Parameters<Fetch> }) => {
    return apiClient.fetch(...payload.args)
  }
)

agent.subscribeToIntent<TrackedEvent, void>('analytics:track', payload => {
  // TODO: Track analytics events via API
  // 0. Create API endpoint for tracking
  // 1. Batch analytics events
  // 2. Send to backend

  if (env.BUILD_ENV === 'development') {
    logger.debug('analytics:track', payload)
  }

  return resolve(undefined)
})
