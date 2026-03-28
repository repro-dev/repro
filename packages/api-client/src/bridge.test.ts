import { Agent, Intent } from '@repro/messaging'
import { FutureInstance, resolve } from 'fluture'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createApiClientBridge } from './bridge'
import { ApiClient } from './createApiClient'

// Minimal fake ApiClient that records calls
function createFakeApiClient(): ApiClient & { calls: Array<unknown[]> } {
  const calls: Array<unknown[]> = []
  return {
    calls,
    authStore: {} as never,
    fetch<R = unknown>(...args: unknown[]): FutureInstance<Error, R> {
      calls.push(args)
      return resolve(undefined as unknown as R)
    },
    debug: () => () => undefined,
    wrapP: <R>(_method: FutureInstance<unknown, R>): Promise<R> =>
      Promise.resolve(undefined as unknown as R),
  }
}

// Fake agent that captures raised intents
function createFakeAgent(): Agent & {
  raisedIntents: Array<{ type: string; payload: unknown }>
  handlers: Map<string, (payload: unknown) => FutureInstance<Error, unknown>>
} {
  const raisedIntents: Array<{ type: string; payload: unknown }> = []
  const handlers = new Map<
    string,
    (payload: unknown) => FutureInstance<Error, unknown>
  >()

  return {
    name: 'test',
    raisedIntents,
    handlers,
    raiseIntent<R>(intent: Intent): FutureInstance<Error, R> {
      raisedIntents.push({ type: intent.type, payload: intent.payload })
      return resolve(undefined as unknown as R)
    },
    subscribeToIntent(type, resolver) {
      handlers.set(
        type,
        resolver as (payload: unknown) => FutureInstance<Error, unknown>
      )
      return () => undefined
    },
    destroy() {},
  }
}

describe('api-client: bridge', () => {
  describe('createApiClientBridge', () => {
    it('raises api-client:fetch intent when fetch is called', () => {
      const fakeAgent = createFakeAgent()
      const fakeClient = createFakeApiClient()
      const bridge = createApiClientBridge(fakeAgent, fakeClient)

      bridge.fetch('/test', { method: 'get' })

      assert.equal(fakeAgent.raisedIntents.length, 1)
      assert.equal(fakeAgent.raisedIntents[0]!.type, 'api-client:fetch')
    })

    it('strips AbortSignal from the fetch payload so it can be postMessaged', () => {
      const fakeAgent = createFakeAgent()
      const fakeClient = createFakeApiClient()
      const bridge = createApiClientBridge(fakeAgent, fakeClient)

      const controller = new AbortController()
      bridge.fetch('/test', { method: 'get', signal: controller.signal })

      const raised = fakeAgent.raisedIntents[0]!
      const payload = raised.payload as { requestId: string; args: unknown[] }

      // Signal must NOT be in the payload
      const opts = (payload.args[1] ?? {}) as Record<string, unknown>
      assert.equal(
        opts['signal'],
        undefined,
        'signal must not appear in payload args'
      )
    })

    it('includes a requestId in the payload', () => {
      const fakeAgent = createFakeAgent()
      const fakeClient = createFakeApiClient()
      const bridge = createApiClientBridge(fakeAgent, fakeClient)

      bridge.fetch('/test')

      const payload = fakeAgent.raisedIntents[0]!.payload as {
        requestId: string
        args: unknown[]
      }
      assert.ok(
        typeof payload.requestId === 'string' && payload.requestId.length > 0,
        'payload must contain a non-empty requestId'
      )
    })

    it('raises api-client:abort intent when signal aborts', () => {
      const fakeAgent = createFakeAgent()
      const fakeClient = createFakeApiClient()
      const bridge = createApiClientBridge(fakeAgent, fakeClient)

      const controller = new AbortController()
      bridge.fetch('/test', { method: 'get', signal: controller.signal })

      const fetchPayload = fakeAgent.raisedIntents[0]!.payload as {
        requestId: string
        args: unknown[]
      }
      const requestId = fetchPayload.requestId

      // Abort the controller
      controller.abort()

      // Should have raised a second intent
      assert.equal(fakeAgent.raisedIntents.length, 2)
      assert.equal(fakeAgent.raisedIntents[1]!.type, 'api-client:abort')
      const abortPayload = fakeAgent.raisedIntents[1]!.payload as {
        requestId: string
      }
      assert.equal(abortPayload.requestId, requestId)
    })

    it('does not raise api-client:abort if no signal is provided', () => {
      const fakeAgent = createFakeAgent()
      const fakeClient = createFakeApiClient()
      const bridge = createApiClientBridge(fakeAgent, fakeClient)

      bridge.fetch('/test', { method: 'get' })

      // Only the fetch intent, no abort intent
      assert.equal(fakeAgent.raisedIntents.length, 1)
    })
  })
})
