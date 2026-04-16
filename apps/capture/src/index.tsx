import { cache as styleCache } from '@jsxstyle/react'
import { Analytics } from '@repro/analytics'
import { ApiProvider, createApiClientBridge } from '@repro/api-client'
import { AuthProvider, GateProvider } from '@repro/auth'
import { PortalRootProvider } from '@repro/design'
import { Stats, Trace } from '@repro/diagnostics'
import {
  ConsoleEvent,
  ConsoleMessage,
  LogLevel,
  MessagePart,
  MessagePartType,
  NetworkEvent,
  NetworkMessage,
  PerformanceEntry,
  PerformanceEvent,
  SourceEvent,
  SourceEventType,
  StackEntry,
} from '@repro/domain'
import { MessagingProvider, getDefaultAgent } from '@repro/messaging'
import {
  RecordingStreamProvider,
  createRecordingStream,
} from '@repro/recording'
import { Box } from '@repro/tdl'
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

const agent = getDefaultAgent()

Analytics.setAgent(agent)

// Proxy API calls over messaging layer
const apiClientBridge = createApiClientBridge(agent)

// ---------------------------------------------------------------------------
// Helpers for transforming runtime buffer events to SourceEvent envelopes
// ---------------------------------------------------------------------------

function levelStringToLogLevel(level: string): LogLevel {
  switch (level) {
    case 'verbose':
      return LogLevel.Verbose
    case 'info':
      return LogLevel.Info
    case 'warning':
      return LogLevel.Warning
    case 'error':
      return LogLevel.Error
    default:
      return LogLevel.Info
  }
}

function isPerformanceEntry(event: unknown): event is PerformanceEntry {
  return (
    typeof event === 'object' &&
    event !== null &&
    'entryType' in event &&
    'startTime' in event
  )
}

class ReproCapture extends HTMLElement {
  private renderRoot: Root | null = null
  private state = createState()

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

    // Detect types already installed by the headless runtime bundle.
    // Exclude them from the stream to avoid double-patching observers.
    const runtimeInstalledTypes = new Set(
      window.__REPRO_RUNTIME_INSTALLED_TYPES__ ?? []
    )

    type RecordingType =
      | 'dom'
      | 'interaction'
      | 'network'
      | 'console'
      | 'performance'
      | 'state'

    const allTypes: RecordingType[] = [
      'dom',
      'interaction',
      'network',
      'console',
      'performance',
      'state',
    ]

    // Remove types already patched by the runtime so observers are not
    // re-installed (which would double-wrap globalThis proxies).
    const streamTypes = new Set(
      allTypes.filter(t => !runtimeInstalledTypes.has(t))
    )

    const stream = createRecordingStream(document, {
      types: streamTypes,
      ignoredNodes,
      ignoredSelectors,
    })

    // Drain the runtime pre-stream buffer synchronously before stream.start()
    // so pre-load events are correctly sequenced. The buffer holds raw events
    // pushed by the headless runtime: NetworkMessage, {__runtimeConsole}, PerformanceEntry.
    if (
      window.__REPRO_RUNTIME_BUFFER__ &&
      window.__REPRO_RUNTIME_BUFFER__.length > 0
    ) {
      const sourceEvents: SourceEvent[] = []

      for (const event of window.__REPRO_RUNTIME_BUFFER__) {
        if (
          typeof event === 'object' &&
          event !== null &&
          '__runtimeConsole' in event
        ) {
          // Console message: runtime format → ConsoleMessage → ConsoleEvent envelope
          const runtimeConsole = event as {
            __runtimeConsole: true
            level: string
            args: unknown[]
            time: number
          }
          const parts: MessagePart[] = runtimeConsole.args.map(
            arg =>
              new Box({
                type: MessagePartType.String,
                value: String(arg),
              })
          )
          const logLevel = levelStringToLogLevel(runtimeConsole.level)
          const consoleMessage: ConsoleMessage = {
            level: logLevel,
            parts,
            stack: [] as StackEntry[],
          }
          const consoleEvent: ConsoleEvent = {
            type: SourceEventType.Console,
            time: runtimeConsole.time,
            data: consoleMessage,
          }
          sourceEvents.push(new Box(consoleEvent))
        } else if (isPerformanceEntry(event)) {
          // Performance entry: PerformanceEntry → PerformanceEvent envelope
          const entry = event as PerformanceEntry
          const perfEvent: PerformanceEvent = {
            type: SourceEventType.Performance,
            time: performance.now(),
            data: entry,
          }
          sourceEvents.push(new Box(perfEvent))
        } else {
          // Network message: NetworkMessage → NetworkEvent envelope
          const message = event as NetworkMessage
          const netEvent: NetworkEvent = {
            type: SourceEventType.Network,
            time: performance.now(),
            data: message,
          }
          sourceEvents.push(new Box(netEvent))
        }
      }

      stream.injectBufferedEvents(sourceEvents)

      // Mutate the buffer in-place to preserve the closure reference held by
      // the runtime's event subscriber (creating a new array would break it).
      window.__REPRO_RUNTIME_BUFFER__.length = 0
    }

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
    this.renderRoot?.unmount()
  }
}

declare global {
  interface Window {
    __REPRO_USING_SDK: boolean
    __REPRO_RUNTIME_BUFFER__?: Array<unknown>
    __REPRO_RUNTIME_INSTALLED__?: boolean
    __REPRO_RUNTIME_INSTALLED_TYPES__?: string[]
  }
}

if (!window.__REPRO_USING_SDK) {
  agent.subscribeToIntent('enable', () => {
    if (!window.customElements.get(NODE_NAME)) {
      window.customElements.define(NODE_NAME, ReproCapture)
    }

    if (!document.querySelector(NODE_NAME)) {
      const root = new ReproCapture()
      document.body.appendChild(root)
    }

    return resolve(undefined)
  })

  agent.subscribeToIntent('disable', () => {
    const root = document.querySelector(NODE_NAME)

    if (root) {
      root.remove()
    }

    return resolve(undefined)
  })
}
