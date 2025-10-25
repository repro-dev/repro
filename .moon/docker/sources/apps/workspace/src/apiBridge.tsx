import { createApiClient } from '@repro/api-client'
import { Fetch } from '@repro/api-client/src/types'
import { createMessagePortAgent } from '@repro/messaging'

const apiClient = createApiClient({
  baseUrl: process.env.REPRO_API_URL ?? '',
  authStorage: 'memory',
})

window.addEventListener('message', event => {
  if (event.data === 'repro-bridge-agent-port') {
    const port = event.ports[0]

    if (port) {
      const agent = createMessagePortAgent(port)
      port.start()

      agent.subscribeToIntent(
        'api-client:fetch',
        (payload: { args: Parameters<Fetch> }) => {
          return apiClient.fetch(...payload.args)
        }
      )
    }
  }
})
