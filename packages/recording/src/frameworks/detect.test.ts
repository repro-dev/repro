import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { detectFrameworks } from './detect'

// Helper to create a mock window object for tests. We cast through `unknown`
// first because partial objects don't overlap with `typeof globalThis`.
function mockWin(globals: Record<string, unknown>): typeof globalThis {
  return globals as unknown as typeof globalThis
}

describe('detectFrameworks', () => {
  it('returns all false on an empty window object', () => {
    const result = detectFrameworks(mockWin({}))
    assert.deepEqual(result, {
      react: false,
      redux: false,
      vue: false,
      zustand: false,
    })
  })

  it('detects React via __REACT_DEVTOOLS_GLOBAL_HOOK__', () => {
    const result = detectFrameworks(
      mockWin({ __REACT_DEVTOOLS_GLOBAL_HOOK__: {} })
    )
    assert.equal(result.react, true)
    assert.equal(result.redux, false)
    assert.equal(result.vue, false)
    assert.equal(result.zustand, false)
  })

  it('detects Redux via __REDUX_DEVTOOLS_EXTENSION__', () => {
    const result = detectFrameworks(
      mockWin({ __REDUX_DEVTOOLS_EXTENSION__: {} })
    )
    assert.equal(result.redux, true)
    assert.equal(result.react, false)
  })

  it('detects Redux via store shape (dispatch + getState + subscribe on store global)', () => {
    const result = detectFrameworks(
      mockWin({
        store: {
          dispatch: () => {},
          getState: () => {},
          subscribe: () => {},
        },
      })
    )
    assert.equal(result.redux, true)
  })

  it('detects Vue via __VUE__', () => {
    const result = detectFrameworks(mockWin({ __VUE__: {} }))
    assert.equal(result.vue, true)
    assert.equal(result.react, false)
    assert.equal(result.redux, false)
    assert.equal(result.zustand, false)
  })

  it('detects Vue via Vue global', () => {
    const result = detectFrameworks(mockWin({ Vue: {} }))
    assert.equal(result.vue, true)
  })

  it('detects Zustand via __zustand', () => {
    const result = detectFrameworks(mockWin({ __zustand: {} }))
    assert.equal(result.zustand, true)
    assert.equal(result.react, false)
    assert.equal(result.redux, false)
    assert.equal(result.vue, false)
  })

  it('detects multiple frameworks simultaneously', () => {
    const result = detectFrameworks(
      mockWin({
        __REACT_DEVTOOLS_GLOBAL_HOOK__: {},
        __REDUX_DEVTOOLS_EXTENSION__: {},
        __VUE__: {},
        __zustand: {},
      })
    )
    assert.deepEqual(result, {
      react: true,
      redux: true,
      vue: true,
      zustand: true,
    })
  })

  it('ignores unknown globals (no false positives)', () => {
    const result = detectFrameworks(
      mockWin({
        unknownLib: {},
        someOtherGlobal: { foo: 'bar' },
      })
    )
    assert.deepEqual(result, {
      react: false,
      redux: false,
      vue: false,
      zustand: false,
    })
  })
})
