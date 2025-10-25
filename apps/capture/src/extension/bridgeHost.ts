import { logger } from '@repro/logger'
import Future, { fork } from 'fluture'
import { createRuntimeAgent } from './createRuntimeAgent'

function attachIframe() {
  return Future<Error, Window>((reject, resolve) => {
    const apiBridgeRoot = document.createElement('iframe')
    apiBridgeRoot.src = `${process.env.REPRO_APP_URL}/apiBridge.html`

    apiBridgeRoot.onload = () => {
      if (apiBridgeRoot.contentWindow) {
        resolve(apiBridgeRoot.contentWindow)
      } else {
        reject(
          new Error('Could not get reference to API bridge frame window object')
        )
      }
    }

    apiBridgeRoot.onerror = () => {
      reject(new Error('Could not attach API bridge frame'))
    }

    document.body.appendChild(apiBridgeRoot)

    return () => {
      apiBridgeRoot.remove()
    }
  })
}

function main() {
  attachIframe().pipe(
    fork(error => logger.error(error))(contentWindow => {
      const hostAgent = createRuntimeAgent()

      const channel = new MessageChannel()

      contentWindow.postMessage(
        'repro-bridge-agent-port',
        `${process.env.REPRO_APP_URL}`,
        [channel.port2]
      )

      const bridgeAgent = createMessagePortAgent(channel.port1)

      hostAgent.subscribeToIntentAndForward('api-client:fetch', bridgeAgent)
      hostAgent.subscribeToIntentAndForward('upload:enqueue', bridgeAgent)
      hostAgent.subscribeToIntentAndForward('upload:progress', bridgeAgent)
      hostAgent.subscribeToIntentAndForward('analytics:track', bridgeAgent)
    })
  )
}

main()
