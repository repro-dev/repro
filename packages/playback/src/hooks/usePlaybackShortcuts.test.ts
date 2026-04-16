// usePlaybackShortcuts.test.ts
//
// IMPORTANT: This test file must NOT statically import 'shortcuts'. The
// mock.module() call at the top of this file intercepts 'shortcuts' for all
// subsequent dynamic imports. We do this once before the module registry
// resolves the hook, so all tests see the same MockShortcuts class.
// The mock captures a shared `currentInstance` per test so individual tests
// can inspect/control shortcut registration.

import expect from 'expect'
import { beforeEach, describe, it, mock } from 'node:test'

type ShortcutEntry = { shortcut: string; handler: () => void }

// ---------------------------------------------------------------------------
// Shared mock state — reset in beforeEach so each test starts clean
// ---------------------------------------------------------------------------

let capturedShouldHandleEvent: (() => boolean) | undefined
let registeredEntries: ShortcutEntry[] = []
let resetCalled = false

class MockShortcuts {
  constructor(opts?: { shouldHandleEvent?: () => boolean }) {
    capturedShouldHandleEvent = opts?.shouldHandleEvent
    resetCalled = false
  }

  add(entries: ShortcutEntry[]) {
    registeredEntries.push(...entries)
  }

  reset() {
    resetCalled = true
  }
}

// Must be called before any dynamic import of usePlaybackShortcuts
mock.module('shortcuts', {
  namedExports: { Shortcuts: MockShortcuts },
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setActiveElement(el: Element | null) {
  Object.defineProperty(document, 'activeElement', {
    value: el,
    configurable: true,
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('usePlaybackShortcuts', () => {
  // Lazy import — resolved once after mock.module is registered
  let usePlaybackShortcuts: (entries: ShortcutEntry[]) => void

  let renderHook: typeof import('@testing-library/react')['renderHook']

  // Import once before all tests run
  it.todo('setup') // placeholder so node:test runs the describe block

  beforeEach(async () => {
    if (!usePlaybackShortcuts) {
      const mod = await import('./usePlaybackShortcuts.js')
      usePlaybackShortcuts = mod.usePlaybackShortcuts

      const rtl = await import('@testing-library/react')
      renderHook = rtl.renderHook
    }

    // Reset shared state for each test
    capturedShouldHandleEvent = undefined
    registeredEntries = []
    resetCalled = false
    setActiveElement(null)
  })

  it('registers provided entries with Shortcuts', async () => {
    const handler = mock.fn()
    const entries = [{ shortcut: 'Space', handler }]

    renderHook(() => usePlaybackShortcuts(entries))

    expect(registeredEntries).toEqual(
      expect.arrayContaining([{ shortcut: 'Space', handler }])
    )
  })

  it('dispatches Space handler when hook registers it', async () => {
    const togglePlayback = mock.fn()
    renderHook(() =>
      usePlaybackShortcuts([{ shortcut: 'Space', handler: togglePlayback }])
    )

    // Verify the Space entry was registered (the library calls handler on keypress)
    const entry = registeredEntries.find(e => e.shortcut === 'Space')
    expect(entry).toBeDefined()

    // Simulate handler invocation
    entry?.handler()
    expect(togglePlayback.mock.calls.length).toBe(1)
  })

  it('Right shortcut is registered for stepForward', async () => {
    const stepForward = mock.fn()
    renderHook(() =>
      usePlaybackShortcuts([{ shortcut: 'Right', handler: stepForward }])
    )

    const entry = registeredEntries.find(e => e.shortcut === 'Right')
    expect(entry).toBeDefined()
    entry?.handler()
    expect(stepForward.mock.calls.length).toBe(1)
  })

  it('Left shortcut is registered for stepBack', async () => {
    const stepBack = mock.fn()
    renderHook(() =>
      usePlaybackShortcuts([{ shortcut: 'Left', handler: stepBack }])
    )

    const entry = registeredEntries.find(e => e.shortcut === 'Left')
    expect(entry).toBeDefined()
    entry?.handler()
    expect(stepBack.mock.calls.length).toBe(1)
  })

  it('Plus shortcut is registered for increaseSpeed', async () => {
    const increaseSpeed = mock.fn()
    renderHook(() =>
      usePlaybackShortcuts([{ shortcut: 'Plus', handler: increaseSpeed }])
    )

    const entry = registeredEntries.find(e => e.shortcut === 'Plus')
    expect(entry).toBeDefined()
    entry?.handler()
    expect(increaseSpeed.mock.calls.length).toBe(1)
  })

  it('Equal shortcut is registered for increaseSpeed', async () => {
    const increaseSpeed = mock.fn()
    renderHook(() =>
      usePlaybackShortcuts([{ shortcut: 'Equal', handler: increaseSpeed }])
    )

    const entry = registeredEntries.find(e => e.shortcut === 'Equal')
    expect(entry).toBeDefined()
    entry?.handler()
    expect(increaseSpeed.mock.calls.length).toBe(1)
  })

  it('Minus shortcut is registered for decreaseSpeed', async () => {
    const decreaseSpeed = mock.fn()
    renderHook(() =>
      usePlaybackShortcuts([{ shortcut: 'Minus', handler: decreaseSpeed }])
    )

    const entry = registeredEntries.find(e => e.shortcut === 'Minus')
    expect(entry).toBeDefined()
    entry?.handler()
    expect(decreaseSpeed.mock.calls.length).toBe(1)
  })

  it('number key 5 is registered (seeks to 50% of duration)', async () => {
    const seek50 = mock.fn()
    renderHook(() => usePlaybackShortcuts([{ shortcut: '5', handler: seek50 }]))

    const entry = registeredEntries.find(e => e.shortcut === '5')
    expect(entry).toBeDefined()
    entry?.handler()
    expect(seek50.mock.calls.length).toBe(1)
  })

  it('number key 0 is registered (seeks to 0ms)', async () => {
    const seek0 = mock.fn()
    renderHook(() => usePlaybackShortcuts([{ shortcut: '0', handler: seek0 }]))

    const entry = registeredEntries.find(e => e.shortcut === '0')
    expect(entry).toBeDefined()
    entry?.handler()
    expect(seek0.mock.calls.length).toBe(1)
  })

  it('Home shortcut is registered (seeks to beginning)', async () => {
    const seekToStart = mock.fn()
    renderHook(() =>
      usePlaybackShortcuts([{ shortcut: 'Home', handler: seekToStart }])
    )

    const entry = registeredEntries.find(e => e.shortcut === 'Home')
    expect(entry).toBeDefined()
    entry?.handler()
    expect(seekToStart.mock.calls.length).toBe(1)
  })

  it('End shortcut is registered (seeks to end)', async () => {
    const seekToEnd = mock.fn()
    renderHook(() =>
      usePlaybackShortcuts([{ shortcut: 'End', handler: seekToEnd }])
    )

    const entry = registeredEntries.find(e => e.shortcut === 'End')
    expect(entry).toBeDefined()
    entry?.handler()
    expect(seekToEnd.mock.calls.length).toBe(1)
  })

  it('shouldHandleEvent returns false when focus is in an <input>', async () => {
    renderHook(() =>
      usePlaybackShortcuts([{ shortcut: 'Space', handler: mock.fn() }])
    )

    const input = document.createElement('input')
    setActiveElement(input)

    expect(capturedShouldHandleEvent?.()).toBe(false)
  })

  it('shouldHandleEvent returns false when focus is in a <textarea>', async () => {
    renderHook(() =>
      usePlaybackShortcuts([{ shortcut: 'Space', handler: mock.fn() }])
    )

    const textarea = document.createElement('textarea')
    setActiveElement(textarea)

    expect(capturedShouldHandleEvent?.()).toBe(false)
  })

  it('shouldHandleEvent returns false when focus is in a <select>', async () => {
    renderHook(() =>
      usePlaybackShortcuts([{ shortcut: 'Space', handler: mock.fn() }])
    )

    const select = document.createElement('select')
    setActiveElement(select)

    expect(capturedShouldHandleEvent?.()).toBe(false)
  })

  it('shouldHandleEvent returns true when no element is focused', async () => {
    renderHook(() =>
      usePlaybackShortcuts([{ shortcut: 'Space', handler: mock.fn() }])
    )

    setActiveElement(null)
    expect(capturedShouldHandleEvent?.()).toBe(true)
  })

  it('calls reset() on unmount — no leaked listeners', async () => {
    const handler = mock.fn()
    const { unmount } = renderHook(() =>
      usePlaybackShortcuts([{ shortcut: 'Space', handler }])
    )

    unmount()

    expect(resetCalled).toBe(true)
  })
})
