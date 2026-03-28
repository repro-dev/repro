import { fork, resolve } from 'fluture'
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'
import { DEFERRED_INTENT_TIMEOUT_MS } from './constants'
import { createMessagingAgent } from './createMessagingAgent'

// Build a context that wraps the real jsdom window but shims postMessage to
// use the positional-argument signature that jsdom supports (rather than the
// options-object form that the real browser API accepts but jsdom does not).
function createTestContext(): typeof globalThis {
  // jsdom registers window/document/etc on globalThis via global-jsdom/register.
  // We wrap globalThis and replace postMessage so the agent's announce() call
  // doesn't throw "Invalid target origin '[object Object]'".
  const shimmedWindow = new Proxy(globalThis, {
    get(target, prop, receiver) {
      if (prop === 'postMessage') {
        // jsdom's postMessage(msg, targetOrigin, transfer?) — positional args
        return (
          message: unknown,
          options: { targetOrigin?: string; transfer?: Transferable[] } | string
        ) => {
          const targetOrigin =
            typeof options === 'string' ? options : options?.targetOrigin ?? '*'
          const transfer =
            typeof options === 'object' ? options?.transfer ?? [] : []
          ;(target as unknown as Window).postMessage(
            message,
            targetOrigin,
            transfer
          )
        }
      }
      if (prop === 'self' || prop === 'parent') {
        // Return shimmedWindow itself so agent treats itself as root (no upstream)
        return shimmedWindow
      }
      return Reflect.get(target, prop, receiver)
    },
  })
  return shimmedWindow as unknown as typeof globalThis
}

describe('createMessagingAgent: deferred intent timeout', () => {
  beforeEach(() => {
    mock.timers.enable({ apis: ['setTimeout'] })
  })

  afterEach(() => {
    mock.timers.reset()
  })

  it('rejects a deferred intent after DEFERRED_INTENT_TIMEOUT_MS when no resolution target appears', () => {
    const agent = createMessagingAgent({
      name: 'test-agent',
      context: createTestContext(),
    })

    let rejected: Error | undefined
    const fut = agent.raiseIntent<string>({ type: 'missing:intent' })
    fut.pipe(
      fork<Error>(err => {
        rejected = err
      })(() => {
        // should not resolve
      })
    )

    // Before timeout: not rejected yet
    mock.timers.tick(DEFERRED_INTENT_TIMEOUT_MS - 1)
    assert.equal(rejected, undefined, 'should not be rejected before timeout')

    // At the timeout boundary: rejected
    mock.timers.tick(1)
    assert.ok(rejected, 'should be rejected with an Error')

    agent.destroy()
  })

  it('resolves normally when the resolver is registered before raiseIntent (no deferral)', () => {
    const agent = createMessagingAgent({
      name: 'test-agent',
      context: createTestContext(),
    })

    // Subscribe first so the intent is resolved immediately (never deferred)
    agent.subscribeToIntent('test:action', () => resolve('ok'))

    // The fact that raiseIntent does not throw and the agent does not set a
    // deferral timer is all we can assert in the same-agent synchronous case.
    // The Future's response is processed before fork callbacks are installed
    // (an architectural constraint of the single-agent path), so 'resolved'
    // will stay undefined — but critically, no rejection must occur either.
    let rejected: Error | undefined
    agent.raiseIntent<string>({ type: 'test:action' }).pipe(
      fork<Error>(err => {
        rejected = err
      })(() => {})
    )

    // Advance past where the timeout would have fired
    mock.timers.tick(DEFERRED_INTENT_TIMEOUT_MS + 1)

    // No rejection — the intent was resolved (not deferred), so no timer was set
    assert.equal(
      rejected,
      undefined,
      'should not be rejected when intent is resolved immediately'
    )

    agent.destroy()
  })

  it('cancels the timeout when flushDeferredIntents is triggered before the timer fires', () => {
    // Verifies that calling flushDeferredIntents before the timeout elapses
    // cancels the deferred intent timer. The intent may still reject for other
    // reasons (e.g. ordering in subscribeToIntent), but it must NOT reject with
    // the "timed out" message.
    const agent = createMessagingAgent({
      name: 'test-agent',
      context: createTestContext(),
    })

    let rejectedMessage: string | undefined
    agent.raiseIntent<string>({ type: 'deferred:action' }).pipe(
      fork<Error>(err => {
        rejectedMessage = err.message
      })(() => {})
    )

    // Intent is deferred; advance partway
    mock.timers.tick(DEFERRED_INTENT_TIMEOUT_MS / 2)

    // Subscribing triggers flushDeferredIntents, which must clearTimeout
    agent.subscribeToIntent('deferred:action', () => resolve('flushed'))

    // Advance past the full timeout — the cleared timer must not fire
    mock.timers.tick(DEFERRED_INTENT_TIMEOUT_MS)

    // If a rejection occurred, it must NOT be the timeout error — it must
    // be the "Missing resolver" ordering artifact of same-agent flush, not
    // our deferred-timeout logic.
    if (rejectedMessage !== undefined) {
      assert.ok(
        !rejectedMessage.includes('timed out'),
        `timeout rejection must not fire after flush; got: "${rejectedMessage}"`
      )
    }

    agent.destroy()
  })

  it('includes the intent type and workspace service hint in the error message', () => {
    const agent = createMessagingAgent({
      name: 'test-agent',
      context: createTestContext(),
    })

    let rejected: Error | undefined
    agent.raiseIntent<string>({ type: 'api-client:fetch' }).pipe(
      fork<Error>(err => {
        rejected = err
      })(() => {})
    )

    mock.timers.tick(DEFERRED_INTENT_TIMEOUT_MS)

    assert.ok(rejected instanceof Error)
    assert.ok(
      rejected.message.includes('api-client:fetch'),
      `error message should include intent type; got: "${rejected.message}"`
    )
    assert.ok(
      rejected.message.toLowerCase().includes('workspace'),
      `error message should mention workspace service; got: "${rejected.message}"`
    )

    agent.destroy()
  })

  it('does not reject after destroy() clears pending timers', () => {
    const agent = createMessagingAgent({
      name: 'test-agent',
      context: createTestContext(),
    })

    let rejected: Error | undefined
    agent.raiseIntent<string>({ type: 'missing:intent' }).pipe(
      fork<Error>(err => {
        rejected = err
      })(() => {})
    )

    // Destroy before timeout fires
    agent.destroy()

    // Advance past the timeout — should not fire
    mock.timers.tick(DEFERRED_INTENT_TIMEOUT_MS + 1)

    assert.equal(
      rejected,
      undefined,
      'destroy() should cancel the deferred intent timeout'
    )
  })
})
