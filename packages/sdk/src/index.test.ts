import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

// Tests run in a Node.js environment where window may not exist.
// We simulate presence/absence of window.__REPRO__ by manipulating globalThis.

describe('repro SDK', () => {
  describe('when window.__REPRO__ is absent', () => {
    beforeEach(() => {
      // Ensure __REPRO__ is not present on globalThis
      delete (globalThis as Record<string, unknown>)['__REPRO__']
    })

    it('mark is a no-op and returns undefined', async () => {
      const { mark, repro } = await import('./index.js')
      const result = mark('page_view')
      assert.equal(result, undefined)
      assert.equal(repro.mark('page_view'), undefined)
    })

    it('captureState is a no-op and returns undefined', async () => {
      const { repro } = await import('./index.js')
      const result = repro.captureState('MyComponent', { count: 1 })
      assert.equal(result, undefined)
    })
  })

  describe('when window.__REPRO__ is present', () => {
    const calls: Array<{ method: string; args: unknown[] }> = []

    beforeEach(() => {
      calls.length = 0
      ;(globalThis as Record<string, unknown>)['__REPRO__'] = {
        mark: (name: string, data?: Record<string, unknown>) => {
          calls.push({ method: 'mark', args: [name, data] })
        },
        captureState: (component: string, state: Record<string, unknown>) => {
          calls.push({ method: 'captureState', args: [component, state] })
        },
      }
    })

    afterEach(() => {
      delete (globalThis as Record<string, unknown>)['__REPRO__']
    })

    it('mark delegates to window.__REPRO__.mark', async () => {
      const { mark } = await import('./index.js')
      mark('button_clicked', { label: 'Submit' })
      assert.equal(calls.length, 1)
      assert.deepEqual(calls[0], {
        method: 'mark',
        args: ['button_clicked', { label: 'Submit' }],
      })
    })

    it('captureState delegates to window.__REPRO__.captureState', async () => {
      const { repro } = await import('./index.js')
      repro.captureState('Counter', { value: 42 })
      assert.equal(calls.length, 1)
      assert.deepEqual(calls[0], {
        method: 'captureState',
        args: ['Counter', { value: 42 }],
      })
    })
  })

  it('accepts window.__REPRO__.mark through the ambient Window type', () => {
    if (typeof window !== 'undefined' && window.__REPRO__) {
      window.__REPRO__.mark('typed-check', { enabled: true })
    }

    assert.equal(true, true)
  })
})
