import { createApiClient } from '@repro/api-client'
import { resolve } from 'fluture'

const apiClient = createApiClient({
  baseUrl: process.env.REPRO_API_URL ?? '',
  authStorage: 'memory',
})

window.addEventListener('message', event => {
  if (event.data === 'repro-bridge-agent-port') {
    const port = event.ports[0]

    if (port) {
      const agent = createMessagePortAgent(port)

      agent.subscribeToIntent('api-client:fetch', payload => {
        console.log('Received api-client:fetch intent', payload)
        return resolve<void>(undefined)
      })
    }
  }
})
