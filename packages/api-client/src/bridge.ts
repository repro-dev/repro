import { randomString } from '@repro/random-string'
import { forget } from '@repro/future-utils'
import { Agent } from '@repro/messaging'
import { ApiClient, defaultClient } from './createApiClient'

export function createApiClientBridge(
  agent: Agent,
  apiClient: ApiClient = defaultClient
): ApiClient {
  return new Proxy<ApiClient>(apiClient, {
    get(target: ApiClient, namespace: keyof ApiClient) {
      if (namespace === 'fetch') {
        return new Proxy<ApiClient['fetch']>(target[namespace], {
          apply(_target, _thisArg, argArray) {
            const requestId = randomString(8)
            const [url, options, requestType, responseType] = argArray as Parameters<ApiClient['fetch']>

            // Strip AbortSignal from options — it cannot be structured-cloned
            // across postMessage boundaries. We replace it with a requestId-based
            // cancel mechanism via the api-client:abort intent.
            const { signal, ...restOptions } = options ?? {}

            if (signal) {
              signal.addEventListener(
                'abort',
                () => {
                  forget(
                    agent.raiseIntent({
                      type: 'api-client:abort',
                      payload: { requestId },
                    })
                  )
                },
                { once: true }
              )
            }

            return agent.raiseIntent({
              type: 'api-client:fetch',
              payload: {
                requestId,
                args: [url, restOptions, requestType, responseType],
              },
            })
          },
        })
      }

      return Reflect.get(target, namespace)
    },
  })
}
