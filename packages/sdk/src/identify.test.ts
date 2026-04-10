import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

// Tests run in a Node.js environment where window may not exist.
// We simulate presence/absence of window.__REPRO__ by manipulating globalThis.

describe('identify', () => {
  describe('when window.__REPRO__ is absent', () => {
    beforeEach(() => {
      delete (globalThis as Record<string, unknown>)['__REPRO__']
    })

    afterEach(() => {
      delete (globalThis as Record<string, unknown>)['__REPRO__']
    })

    it('is a no-op and does not throw', async () => {
      const { identify } = await import('./identify.js')
      assert.doesNotThrow(() => identify('user-1'))
    })

    it('returns undefined', async () => {
      const { identify } = await import('./identify.js')
      const result = identify('user-1')
      assert.equal(result, undefined)
    })
  })

  describe('when window.__REPRO__ is present but identify is not a function', () => {
    beforeEach(() => {
      ;(globalThis as Record<string, unknown>)['__REPRO__'] = {}
    })

    afterEach(() => {
      delete (globalThis as Record<string, unknown>)['__REPRO__']
    })

    it('is a no-op and does not throw', async () => {
      const { identify } = await import('./identify.js')
      assert.doesNotThrow(() => identify('user-1'))
    })
  })

  describe('when window.__REPRO__.identify is present', () => {
    const calls: Array<{ userId: string; traits: unknown }> = []

    beforeEach(() => {
      calls.length = 0
      ;(globalThis as Record<string, unknown>)['__REPRO__'] = {
        identify: (userId: string, traits?: Record<string, unknown>) => {
          calls.push({ userId, traits })
        },
      }
    })

    afterEach(() => {
      delete (globalThis as Record<string, unknown>)['__REPRO__']
    })

    it('forwards userId and traits to window.__REPRO__.identify', async () => {
      const { identify } = await import('./identify.js')
      identify('user-1', { plan: 'pro' })
      assert.equal(calls.length, 1)
      assert.deepEqual(calls[0], { userId: 'user-1', traits: { plan: 'pro' } })
    })

    it('forwards call without traits (passes undefined)', async () => {
      const { identify } = await import('./identify.js')
      identify('user-1')
      assert.equal(calls.length, 1)
      assert.deepEqual(calls[0], { userId: 'user-1', traits: undefined })
    })
  })

  describe('package index export', () => {
    it('identify is exported from the package index', async () => {
      const sdk = await import('./index.js')
      assert.equal(typeof sdk.identify, 'function')
    })
  })
})
