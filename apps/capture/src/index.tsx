import { cache as styleCache } from '@jsxstyle/react'
import { Analytics } from '@repro/analytics'
import { ApiProvider, createApiClientBridge } from '@repro/api-client'
import { GateProvider } from '@repro/auth'
import { PortalRootProvider } from '@repro/design'
import { Stats, Trace } from '@repro/diagnostics'
import {
  DEFAULT_AGENT,
  MessagingProvider,
  createPTPAgent,
} from '@repro/messaging'
import {
  RecordingStreamProvider,
  createRecordingStream,
} from '@repro/recording'
import { applyResetStyles } from '@repro/theme'
import { resolve } from 'fluture'
import React from 'react'
import { Root, createRoot } from 'react-dom/client'
import { Controller } from './components/Controller'
import { REPRO_ROOT_ID } from './constants'
import { StateProvider, createState } from './state'

if (process.env.NODE_ENV === 'development') {
  Stats.enable()
  Trace.enable()
}

const NODE_NAME = 'repro-capture'

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

const _initialInjectOptions = styleCache.injectOptions

// Should PTP agent replace Broadcast agent?
const agent = createPTPAgent()

Analytics.setAgent(agent)

// Proxy API calls over messaging layer
const apiClientBridge = createApiClientBridge(agent)

class ReproCapture extends HTMLElement {
  private renderRoot: Root | null = null
  private state = createState()

  public connectedCallback() {
    const shadowRoot = this.attachShadow({ mode: 'closed' })

    const rootElem = document.createElement('div')
    rootElem.id = REPRO_ROOT_ID
    this.renderRoot = createRoot(rootElem)

    const styleRoot = document.createElement('style')
    refs.activeStyleRoot = styleRoot

    shadowRoot.appendChild(styleRoot)
    shadowRoot.appendChild(rootElem)

    styleCache.reset()
    styleCache.injectOptions = _initialInjectOptions
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
    const ignoredSelectors = [NODE_NAME]
    const ignoredNodes: Array<Node> = []

    if (this.shadowRoot) {
      ignoredNodes.push(this.shadowRoot)
    }

    if (document.currentScript) {
      ignoredNodes.push(document.currentScript)
    }

    const stream = createRecordingStream(document, {
      types: new Set([
        'dom',
        'interaction',
        'network',
        'console',
        'performance',
      ]),
      ignoredNodes,
      ignoredSelectors,
    })

    if (refs.activeStyleRoot) {
      applyResetStyles(`#${REPRO_ROOT_ID}`, refs.activeStyleRoot)
    }

    this.renderRoot.render(
      <ApiProvider client={apiClientBridge}>
        <GateProvider>
          <RecordingStreamProvider stream={stream}>
            <StateProvider state={this.state}>
              <MessagingProvider agent={agent}>
                <PortalRootProvider>
                  <Controller />
                </PortalRootProvider>
              </MessagingProvider>
            </StateProvider>
          </RecordingStreamProvider>
        </GateProvider>
      </ApiProvider>
    )
  }

  public disconnectedCallback() {
    this.renderRoot?.unmount()
  }
}

declare global {
  interface Window {
    __REPRO_USING_SDK: boolean
  }
}

// Announce over loopback agent
agent.subscribeToIntentAndForward('announce', DEFAULT_AGENT)

if (!window.__REPRO_USING_SDK) {
  agent.subscribeToIntent('enable', () => {
    if (!window.customElements.get(NODE_NAME)) {
      window.customElements.define(NODE_NAME, ReproCapture)
    }

    if (!document.querySelector(NODE_NAME)) {
      const root = new ReproCapture()
      document.body.appendChild(root)
    }

    return resolve<void>(undefined)
  })

  agent.subscribeToIntent('disable', () => {
    const root = document.querySelector(NODE_NAME)

    if (root) {
      root.remove()
    }

    return resolve<void>(undefined)
  })
}
