import { TrackedEvent } from '@repro/analytics'
import { createApiClient } from '@repro/api-client'
import { Fetch } from '@repro/api-client/src/types'
import { logger } from '@repro/logger'
import { createMessagingAgent } from '@repro/messaging'
import { FutureInstance, bichain, reject, resolve } from 'fluture'
import { defaultEnv as env } from '~/config/env'

const apiClient = createApiClient({
  baseUrl: env.REPRO_API_URL ?? '',
  authStorage: 'memory',
})

const agent = createMessagingAgent({
  name: 'apiBridge',
})

// Map of in-flight request IDs to their AbortControllers. Allows abort signals
// originating in the page context to be forwarded across the postMessage boundary.
const abortControllers = new Map<string, AbortController>()

agent.subscribeToIntent<{ requestId: string; args: Parameters<Fetch> }, unknown>(
  'api-client:fetch',
  payload => {
    const { requestId, args } = payload
    const [url, options, requestType, responseType] = args
    const controller = new AbortController()
    abortControllers.set(requestId, controller)

    // Merge the locally-created signal into the fetch options
    const argsWithSignal: Parameters<Fetch> = [
      url,
      { ...options, signal: controller.signal },
      requestType,
      responseType,
    ]

    // Clean up the abort controller map regardless of success or failure
    const cleanup = () => {
      abortControllers.delete(requestId)
    }

    const result: FutureInstance<Error, unknown> = apiClient.fetch(
      ...argsWithSignal
    )

    return result.pipe(
      bichain<Error, Error, unknown>(err => {
        cleanup()
        return reject(err)
      })(val => {
        cleanup()
        return resolve(val)
      })
    )
  }
)

agent.subscribeToIntent<{ requestId: string }, void>(
  'api-client:abort',
  payload => {
    const controller = abortControllers.get(payload.requestId)
    if (controller) {
      controller.abort()
    }
    return resolve(undefined)
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
