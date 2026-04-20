import { cache as styleCache } from '@jsxstyle/react'
import { Analytics } from '@repro/analytics'
import { ApiProvider, createApiClientBridge } from '@repro/api-client'
import { AuthProvider, GateProvider } from '@repro/auth'
import { PortalRootProvider } from '@repro/design'
import { Stats, Trace } from '@repro/diagnostics'
import { MessagingProvider, getDefaultAgent } from '@repro/messaging'
import {
  RecordingStreamProvider,
  createRecordingStream,
} from '@repro/recording'
import { applyResetStyles } from '@repro/theme'
import Future, { map, resolve } from 'fluture'
import React from 'react'
import { Root, createRoot } from 'react-dom/client'
import { Controller } from './components/Controller'
import { REPRO_ROOT_ID } from './constants'
import { clearRuntimeBuffer } from './runtimeBuffer'
import { StateProvider, createState } from './state'

if (process.env.NODE_ENV === 'development') {
  Stats.enable()
  Trace.enable()
}

const NODE_NAME = 'repro-capture'

type RuntimeInstalledType = 'console' | 'network' | 'performance'

declare global {
  interface Window {
    __REPRO_RUNTIME_BUFFER__?: Array<DataView>
    __REPRO_RUNTIME_BUFFER_SINK__?: (event: DataView) => void
    __REPRO_RUNTIME_INSTALLED__?: boolean
    __REPRO_RUNTIME_INSTALLED_TYPES__?: Set<RuntimeInstalledType>
    __REPRO_USING_SDK: boolean
  }
}

function waitForBody() {
  return Future<Error, HTMLBodyElement>((reject, resolve) => {
    if (document.body) {
      resolve(document.body as HTMLBodyElement)
      return () => undefined
    }

    const observer = new MutationObserver(() => {
      if (!document.body) {
        return
      }

      observer.disconnect()
      resolve(document.body as HTMLBodyElement)
    })

    try {
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
      })
    } catch (error) {
      reject(error as Error)
    }

    return () => {
      observer.disconnect()
    }
  })
}

function createRecordingTypes() {
  const runtimeInstalledTypes =
    window.__REPRO_RUNTIME_INSTALLED_TYPES__ ?? new Set<RuntimeInstalledType>()

  const recordingTypes: Array<
    'dom' | 'interaction' | 'network' | 'console' | 'performance' | 'state'
  > = ['dom', 'interaction', 'network', 'console', 'performance', 'state']

  return new Set(
    recordingTypes.filter(
      type => !runtimeInstalledTypes.has(type as RuntimeInstalledType)
    )
  )
}

function drainRuntimeBuffer(stream: {
  injectBufferedEvents(events: Array<DataView>): void
}) {
  const runtimeBuffer = window.__REPRO_RUNTIME_BUFFER__

  if (!runtimeBuffer?.length) {
    return
  }

  stream.injectBufferedEvents(runtimeBuffer)
  runtimeBuffer.length = 0
}

function attachRuntimeBufferSink(stream: {
  injectBufferedEvents(events: Array<DataView>): void
}) {
  window.__REPRO_RUNTIME_BUFFER_SINK__ = event => {
    stream.injectBufferedEvents([event])
  }

  return () => {
    if (window.__REPRO_RUNTIME_BUFFER_SINK__) {
      window.__REPRO_RUNTIME_BUFFER_SINK__ = undefined
    }
  }
}

interface Refs {
  // jsxstyle prevents multiple invocations of `cache.injectOptions`,
  // so we cannot register a new style root per custom element.
  // We must keep track of the active style root in global context instead.
  // NB: if we need to support multiple instances, this could hold
  // WeakMap<ReproDevTools, HTMLStyleElement>
  activeStyleRoot: HTMLStyleElement | null
}

const refs: Refs = {
  activeStyleRoot: null,
}

const agent = getDefaultAgent()

Analytics.setAgent(agent)

// Proxy API calls over messaging layer
const apiClientBridge = createApiClientBridge(agent)

class ReproCapture extends HTMLElement {
  private renderRoot: Root | null = null
  private state = createState()
  private detachRuntimeBufferSink: (() => void) | null = null

  public connectedCallback() {
    const shadowRoot = this.attachShadow({ mode: 'open' })

    const rootElem = document.createElement('div')
    rootElem.id = REPRO_ROOT_ID
    this.renderRoot = createRoot(rootElem)

    const styleRoot = document.createElement('style')
    refs.activeStyleRoot = styleRoot

    shadowRoot.appendChild(styleRoot)
    shadowRoot.appendChild(rootElem)

    styleCache.reset()

    // TODO: build and bundle css for prod
    styleCache.injectOptions({
      onInsertRule(rule) {
        if (refs.activeStyleRoot) {
          const sheet = refs.activeStyleRoot.sheet

          if (sheet) {
            sheet.insertRule(rule, sheet.cssRules.length)
          }
        }
      },
    })
    const ignoredSelectors = [NODE_NAME, '.repro-ignore']
    const ignoredNodes: Array<Node> = []

    if (this.shadowRoot) {
      ignoredNodes.push(this.shadowRoot)
    }

    if (document.currentScript) {
      ignoredNodes.push(document.currentScript)
    }

    const stream = createRecordingStream(document, {
      types: createRecordingTypes(),
      ignoredNodes,
      ignoredSelectors,
    })

    this.detachRuntimeBufferSink = attachRuntimeBufferSink(stream)
    drainRuntimeBuffer(stream)

    if (refs.activeStyleRoot) {
      applyResetStyles(`#${REPRO_ROOT_ID}`, refs.activeStyleRoot)
    }

    this.renderRoot.render(
      <ApiProvider client={apiClientBridge}>
        <GateProvider>
          <AuthProvider>
            <RecordingStreamProvider stream={stream}>
              <StateProvider state={this.state}>
                <MessagingProvider agent={agent}>
                  <PortalRootProvider>
                    <Controller />
                  </PortalRootProvider>
                </MessagingProvider>
              </StateProvider>
            </RecordingStreamProvider>
          </AuthProvider>
        </GateProvider>
      </ApiProvider>
    )
  }

  public disconnectedCallback() {
    this.detachRuntimeBufferSink?.()
    this.detachRuntimeBufferSink = null
    clearRuntimeBuffer()
    this.renderRoot?.unmount()
  }
}

if (!window.__REPRO_USING_SDK) {
  agent.subscribeToIntent('enable', () => {
    return waitForBody().pipe(
      map(body => {
        if (!window.customElements.get(NODE_NAME)) {
          window.customElements.define(NODE_NAME, ReproCapture)
        }

        if (!document.querySelector(NODE_NAME)) {
          const root = new ReproCapture()
          body.appendChild(root)
        }

        return undefined
      })
    )
  })

  agent.subscribeToIntent('disable', () => {
    const root = document.querySelector(NODE_NAME)

    if (root) {
      root.remove()
    }

    return resolve<void>(undefined)
  })
}
