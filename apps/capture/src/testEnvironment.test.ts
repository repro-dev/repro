import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

type IdleDeadline = {
  didTimeout: boolean
  timeRemaining(): number
}

type IdleRequestCallback = (deadline: IdleDeadline) => void

describe('capture test environment', () => {
  it('provides requestIdleCallback and cancelIdleCallback', async () => {
    const globals = globalThis as typeof globalThis & {
      requestIdleCallback: IdleRequestCallback
      cancelIdleCallback(handle: ReturnType<typeof setTimeout>): void
    }

    assert.equal(typeof globals.requestIdleCallback, 'function')
    assert.equal(typeof globals.cancelIdleCallback, 'function')

    let ran = false
    const handle = globals.requestIdleCallback(() => {
      ran = true
    })

    await new Promise(resolve => setTimeout(resolve, 5))

    assert.equal(ran, true)

    let cancelled = false
    const cancelledHandle = globals.requestIdleCallback(() => {
      cancelled = true
    })

    globals.cancelIdleCallback(cancelledHandle)

    await new Promise(resolve => setTimeout(resolve, 5))

    assert.equal(cancelled, false)

    globals.cancelIdleCallback(handle)
  })
})
