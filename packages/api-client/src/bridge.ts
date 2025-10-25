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
            return agent.raiseIntent({
              type: 'api-client:fetch',
              payload: {
                args: argArray,
              },
            })
          },
        })
      }

      return Reflect.get(target, namespace)
    },
  })
}
