import { logger } from '@repro/logger'
import { createMessagingAgent } from '@repro/messaging'
import Future, { chain } from 'fluture'
import { createRuntimeAgent } from './createRuntimeAgent'

if (process.env.NODE_ENV === 'development') {
  logger.debug('Repro extension startup time:', performance.now())
}

let scriptElement: HTMLScriptElement | null = null

const hostAgent = createMessagingAgent({ name: 'dev-toolbar content script' })
const runtimeAgent = createRuntimeAgent()

function addPageScript() {
  return Future<any, unknown>((reject, resolve) => {
    if (scriptElement && scriptElement.isConnected) {
      resolve(null)
    } else {
      scriptElement = document.createElement('script')
      scriptElement.src = chrome.runtime.getURL('page.js')
      scriptElement.onerror = reject
      scriptElement.onload = resolve

      const parent = document.documentElement
      parent.insertBefore(scriptElement, parent.firstChild)
    }

    return () => {}
  })
}

runtimeAgent.subscribeToIntent('enable', payload => {
  return addPageScript().pipe(
    chain(() => hostAgent.raiseIntent({ type: 'enable', payload }))
  )
})

runtimeAgent.subscribeToIntent('disable', () => {
  return runtimeAgent.raiseIntent({ type: 'disable' })
})

hostAgent.subscribeToIntent('set-recording-state', (payload: any) => {
  return runtimeAgent.raiseIntent({
    type: 'set-recording-state',
    payload,
  })
})

export {}
