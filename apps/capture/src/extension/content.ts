import { tap } from '@repro/future-utils'
import { createMessagingAgent } from '@repro/messaging'
import Future, { both, cache, resolve } from 'fluture'
import { createRuntimeAgent } from './createRuntimeAgent'
import { createIframe } from './iframe'

const hostAgent = createMessagingAgent({ name: 'contentScript' })
const runtimeAgent = createRuntimeAgent()

const initializePageHost = Future<any, unknown>((reject, resolve) => {
  const scriptElement = document.createElement('script')
  scriptElement.src = chrome.runtime.getURL('capture.js')
  scriptElement.onerror = reject
  scriptElement.onload = resolve
  document.head.appendChild(scriptElement)
  return () => {}
})

const initializeBridgeHost = createIframe(
  chrome.runtime.getURL('bridgeHost.html'),
  {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '0',
    height: '0',
    display: 'none',
  }
)

const connection = cache(
  both<Error, unknown>(initializePageHost)(initializeBridgeHost)
)

hostAgent.subscribeToIntent('detect-capture-extension', () => {
  return resolve(true)
})

runtimeAgent.subscribeToIntent('enable', () => {
  return connection.pipe(tap(() => hostAgent.raiseIntent({ type: 'enable' })))
})

runtimeAgent.subscribeToIntent('disable', () => {
  return connection.pipe(tap(() => hostAgent.raiseIntent({ type: 'disable' })))
})

export {}
