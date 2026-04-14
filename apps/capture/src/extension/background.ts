import { Analytics, stubConsumer } from '@repro/analytics'
import { createApiClient } from '@repro/api-client'
import { RecordingMode, SourceEventView } from '@repro/domain'
import { createUploadWorker } from '@repro/recording-api'
import { parseSchema } from '@repro/validation'
import { fromByteString } from '@repro/wire-formats'
import {
  FutureInstance,
  and,
  attempt,
  attemptP,
  chain,
  fork,
  map,
  node,
  resolve,
} from 'fluture'
import z from 'zod'
import { createRuntimeAgent } from './createRuntimeAgent'

function run<L, R>(source: FutureInstance<L, R>, resolve = console.log) {
  return source.pipe(fork<L>(console.error)<R>(resolve))
}

const StorageKeys = {
  INSTALLER_ID: 'installed_id',
  ENABLED: 'enabled',
}

const agent = createRuntimeAgent()

Analytics.setAgent(agent)
Analytics.registerConsumer(stubConsumer)

const apiClient = createApiClient({
  baseUrl: process.env.REPRO_API_URL || '',
  authStorage: (process.env.AUTH_STORAGE as any) || 'local-storage',
})

const uploadWorker = createUploadWorker(apiClient, {
  withEncryptionScheme: 'none',
})

// Registers capture.js via chrome.scripting API (Chrome 102+)
// This replaces the old <script> tag injection in content.ts
//
// Bridge @types/chrome's incomplete scripting types with local call signatures.
// Tighter union types catch typos that `string` would silently accept.
const scripting = chrome.scripting as unknown as {
  registerContentScripts(
    scripts: {
      id: string
      js?: string[]
      matches?: string[]
      runAt?: 'document_start' | 'document_end' | 'document_idle'
      world?: 'ISOLATED' | 'MAIN'
    }[]
  ): Promise<unknown>
  unregisterContentScripts(opts: { ids: string[] }): Promise<unknown>
}

// Single-flight promise: prevents overlapping register/unregister races
// when onInstalled and onStartup fire in close succession.
let captureScriptRegistration: Promise<void> | null = null

function registerCaptureContentScript(): Promise<void> {
  if (captureScriptRegistration) return captureScriptRegistration

  captureScriptRegistration = (async () => {
    // Unregister first — Chrome persists registered content scripts across
    // service worker restarts, so subsequent calls would otherwise throw.
    try {
      await scripting.unregisterContentScripts({ ids: ['@repro/capture'] })
    } catch (err) {
      // Only suppress the expected "not registered" error; re-throw anything else.
      const message = err instanceof Error ? err.message : String(err)
      if (!message.includes('not registered')) throw err
    }

    await scripting.registerContentScripts([
      {
        id: '@repro/capture',
        js: ['capture.js'],
        matches: ['<all_urls>'],
        runAt: 'document_start',
        world: 'MAIN',
      },
    ])
  })().finally(() => {
    // Clear after completion so a future extension reload can re-register.
    captureScriptRegistration = null
  })

  return captureScriptRegistration
}

const UploadEnqueuePayloadSchema = z.object({
  projectId: z.string(),
  title: z.string(),
  description: z.string(),
  url: z.string(),
  mode: z.nativeEnum(RecordingMode),
  duration: z.number(),
  events: z.array(z.string()),
  browserName: z.string().nullable(),
  browserVersion: z.string().nullable(),
  operatingSystem: z.string().nullable(),
})

type UploadEnqueuePayload = z.infer<typeof UploadEnqueuePayloadSchema>

agent.subscribeToIntent('upload:enqueue', (payload: UploadEnqueuePayload) => {
  return parseSchema(UploadEnqueuePayloadSchema, payload).pipe(
    map(input =>
      uploadWorker.enqueue({
        ...input,
        events: input.events.map(data =>
          SourceEventView.over(new DataView(fromByteString(data).buffer))
        ),
      })
    )
  )
})

const UploadProgressPayloadSchema = z.object({
  ref: z.string(),
})

type UploadProgressPayload = z.infer<typeof UploadProgressPayloadSchema>

agent.subscribeToIntent('upload:progress', (payload: UploadProgressPayload) => {
  return parseSchema(UploadProgressPayloadSchema, payload).pipe(
    map(({ ref }) => uploadWorker.getProgress(ref))
  )
})

chrome.runtime.onInstalled.addListener(() => {
  registerCaptureContentScript().catch(console.error)

  const source = isFirstRun().pipe(
    chain(firstRun =>
      firstRun ? setEnabledState(true) : resolve<void>(undefined)
    )
  )

  return run(source.pipe(and(syncActionState())), () => {
    console.debug('LIFECYCLE: on-installed')
  })
})

chrome.runtime.onStartup.addListener(() => {
  registerCaptureContentScript().catch(console.error)

  return run(syncActionState(), () => {
    console.debug('LIFECYCLE: on-startup')
  })
})

chrome.action.onClicked.addListener(() => {
  const source = toggleEnabledState()
    .pipe(chain(() => getActiveTabId()))
    .pipe(
      chain(activeTabId =>
        activeTabId ? syncTab(activeTabId) : resolve<void>(undefined)
      )
    )

  return run(source, () => {
    console.debug('ACTION: toggle for active tab')
  })
})

chrome.tabs.onActivated.addListener(({ tabId }) => {
  return run(syncTab(tabId), result => {
    console.debug('LIFECYCLE: on-activated', result)
  })
})

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  const actionState = syncActionState()

  const tab = resolve<boolean>(changeInfo.status === 'complete').pipe(
    chain(isComplete =>
      isComplete ? syncTab(tabId) : resolve<void>(undefined)
    )
  )

  return run(actionState.pipe(and(tab)), () => {
    console.debug('LIFECYCLE: on-updated')
  })
})

function syncActionState(): FutureInstance<unknown, void> {
  return isEnabled().pipe(
    chain(enabled => (enabled ? showActiveIcon() : showInactiveIcon()))
  )
}

function getActiveTabId(): FutureInstance<unknown, number | null> {
  return node(done => {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, result => {
      const activeTabId = result[0]?.id
      done(null, activeTabId ?? null)
    })
  })
}

function syncTab(tabId: number) {
  return isEnabled().pipe(
    chain(enabled => (enabled ? enableInTab(tabId) : disableInTab(tabId)))
  )
}

function enableInTab(tabId: number) {
  return agent.raiseIntent({ type: 'enable' }, { target: tabId })
}

function disableInTab(tabId: number) {
  return agent.raiseIntent({ type: 'disable' }, { target: tabId })
}

function isEnabled(): FutureInstance<unknown, boolean> {
  return node(done => {
    chrome.storage.local.get([StorageKeys.ENABLED], result => {
      done(null, result[StorageKeys.ENABLED] || false)
    })
  })
}

function toggleEnabledState() {
  return isEnabled().pipe(chain(enabled => setEnabledState(!enabled)))
}

function setEnabledState(enabled: boolean) {
  return attemptP(() =>
    chrome.storage.local.set({
      [StorageKeys.ENABLED]: enabled,
    })
  ).pipe(chain(() => (enabled ? showActiveIcon() : showInactiveIcon())))
}

function isFirstRun(): FutureInstance<unknown, boolean> {
  return node(done => {
    chrome.storage.local.get([StorageKeys.ENABLED], result => {
      done(null, result[StorageKeys.ENABLED] === undefined)
    })
  })
}

function showActiveIcon(): FutureInstance<unknown, void> {
  return attempt(() =>
    chrome.action.setIcon({
      path: {
        128: 'logo-128.png',
        48: 'logo-48.png',
        32: 'logo-32.png',
        16: 'logo-16.png',
      },
    })
  )
}

function showInactiveIcon(): FutureInstance<unknown, void> {
  return attempt(() =>
    chrome.action.setIcon({
      path: {
        128: 'logo-inactive-128.png',
        48: 'logo-inactive-48.png',
        32: 'logo-inactive-32.png',
        16: 'logo-inactive-16.png',
      },
    })
  )
}

export {}
