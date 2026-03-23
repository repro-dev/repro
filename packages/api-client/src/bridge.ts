import { randomString } from '@repro/random-string'
import { Agent } from '@repro/messaging'
import { ApiClient, defaultClient } from './createApiClient'
import { FetchOptions } from './types'

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

            // Strip AbortSignal from options — it cannot be structured-cloned
            // across postMessage boundaries. We replace it with a requestId-based
            // cancel mechanism via the api-client:abort intent.
            const options = argArray[1] as FetchOptions | undefined
            const { signal, ...restOptions } = options ?? {}

            const modifiedArgArray = [
              argArray[0],
              restOptions,
              ...argArray.slice(2),
            ]

            if (signal) {
              signal.addEventListener(
                'abort',
                () => {
                  agent.raiseIntent({
                    type: 'api-client:abort',
                    payload: { requestId },
                  })
                },
                { once: true }
              )
            }

            return agent.raiseIntent({
              type: 'api-client:fetch',
              payload: {
                requestId,
                args: modifiedArgArray,
              },
            })
          },
        })
      }

      return Reflect.get(target, namespace)
    },
  })
}
