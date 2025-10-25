import { createPTPAgent } from '@repro/messaging'
import Future, { both, chain, resolve } from 'fluture'
import { createRuntimeAgent } from './createRuntimeAgent'

let scriptElement: HTMLScriptElement | null = null
let bridgeIframeElement: HTMLIFrameElement | null = null

const inPageAgent = createPTPAgent()
const runtimeAgent = createRuntimeAgent()

function addBridge() {
  return Future<any, unknown>((reject, resolve) => {
    if (bridgeIframeElement && bridgeIframeElement.isConnected) {
      resolve(null)
    } else {
      bridgeIframeElement = document.createElement('iframe')
      bridgeIframeElement.src = chrome.runtime.getURL('bridge.html')
      bridgeIframeElement.style.position = 'fixed'
      bridgeIframeElement.style.top = '0'
      bridgeIframeElement.style.left = '0'
      bridgeIframeElement.style.width = '0'
      bridgeIframeElement.style.height = '0'
      bridgeIframeElement.style.display = 'none'
      bridgeIframeElement.onerror = reject
      bridgeIframeElement.onload = resolve

      document.body.appendChild(bridgeIframeElement)
    }

    return () => {}
  })
}

function addPageScript() {
  return Future<any, unknown>((reject, resolve) => {
    if (scriptElement && scriptElement.isConnected) {
      resolve(null)
    } else {
      scriptElement = document.createElement('script')
      scriptElement.src = chrome.runtime.getURL('capture.js')
      scriptElement.onerror = reject
      scriptElement.onload = resolve

      document.head.appendChild(scriptElement)
    }

    return () => {}
  })
}

runtimeAgent.subscribeToIntent('enable', () => {
  return both(addBridge())(addPageScript()).pipe(
    chain(() => inPageAgent.raiseIntent({ type: 'enable' }))
  )
})

runtimeAgent.subscribeToIntentAndForward('disable', inPageAgent)

inPageAgent.subscribeToIntentAndForward('api-client:fetch', runtimeAgent)
inPageAgent.subscribeToIntentAndForward('upload:enqueue', runtimeAgent)
inPageAgent.subscribeToIntentAndForward('upload:progress', runtimeAgent)
inPageAgent.subscribeToIntentAndForward('analytics:track', runtimeAgent)

inPageAgent.subscribeToIntent('detect-capture-extension', () => {
  return resolve(true)
})

export {}
