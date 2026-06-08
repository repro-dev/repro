import { cleanup, render } from '@testing-library/react'
import expect from 'expect'
import { describe, it, mock } from 'node:test'
import React from 'react'

// Captured state for Shortcuts mock
let registeredShortcuts: Array<{ shortcut: string; handler: Function }> = []
let capturedShouldHandleEvent: ((event: KeyboardEvent) => boolean) | undefined
let resetCalled = false

const seekToTime = mock.fn()
const getElapsed = mock.fn(() => 10000)
const getDuration = mock.fn(() => 30000)

describe('PlaybackKeyboardShortcuts', () => {
  it('registers keyboard shortcuts, calls playback methods, handles unmount and focus filter', async t => {
    // --- Setup mocks before import ---

    t.mock.module('shortcuts', {
      namedExports: {
        Shortcuts: function MockShortcuts(this: any, options?: any) {
          if (options?.shouldHandleEvent) {
            capturedShouldHandleEvent = options.shouldHandleEvent
          }
          this.add = (descriptors: any) => {
            const arr = Array.isArray(descriptors) ? descriptors : [descriptors]
            registeredShortcuts.push(...arr)
          }
          this.reset = () => {
            registeredShortcuts = []
            resetCalled = true
          }
        },
      },
    })

    const playback = {
      seekToTime,
      getElapsed,
      getDuration,
    }

    t.mock.module('../../hooks', {
      namedExports: {
        usePlayback: () => playback,
      },
    })

    t.mock.module('@repro/analytics', {
      namedExports: {
        Analytics: {
          track: mock.fn(),
        },
      },
    })

    // --- Import component after mocks are set ---
    const { PlaybackKeyboardShortcuts } = await import(
      '../PlaybackKeyboardShortcuts.js'
    )

    // --- Test 1: Component renders null ---
    const { unmount, container } = render(<PlaybackKeyboardShortcuts />)
    expect(container.innerHTML).toBe('')

    // --- Test 2: All 4 shortcuts are registered ---
    expect(registeredShortcuts.length).toBe(4)

    const findByShortcut = (shortcut: string) =>
      registeredShortcuts.find(s => s.shortcut === shortcut)

    const arrowLeft = findByShortcut('ArrowLeft')
    const arrowRight = findByShortcut('ArrowRight')
    const home = findByShortcut('Home')
    const end = findByShortcut('End')

    expect(arrowLeft).toBeDefined()
    expect(arrowRight).toBeDefined()
    expect(home).toBeDefined()
    expect(end).toBeDefined()

    // --- Test 3: ArrowLeft seeks backward 5s (clamped to >= 0) ---
    seekToTime.mock.resetCalls()

    // elapsed = 10000, seek to 10000 - 5000 = 5000
    getElapsed.mock.mockImplementation(() => 10000)
    arrowLeft!.handler()
    expect(seekToTime.mock.calls.length).toBe(1)
    expect(seekToTime.mock.calls[0]?.arguments[0]).toBe(5000)

    // elapsed = 3000, seek to max(0, 3000 - 5000) = 0
    seekToTime.mock.resetCalls()
    getElapsed.mock.mockImplementation(() => 3000)
    arrowLeft!.handler()
    expect(seekToTime.mock.calls[0]?.arguments[0]).toBe(0)

    // --- Test 4: ArrowRight seeks forward 5s (clamped to <= duration) ---
    seekToTime.mock.resetCalls()
    getElapsed.mock.mockImplementation(() => 10000)
    getDuration.mock.mockImplementation(() => 30000)

    // elapsed = 10000, seek to 10000 + 5000 = 15000
    arrowRight!.handler()
    expect(seekToTime.mock.calls.length).toBe(1)
    expect(seekToTime.mock.calls[0]?.arguments[0]).toBe(15000)

    // elapsed = 28000, seek to min(30000, 28000 + 5000) = 30000
    seekToTime.mock.resetCalls()
    getElapsed.mock.mockImplementation(() => 28000)
    arrowRight!.handler()
    expect(seekToTime.mock.calls[0]?.arguments[0]).toBe(30000)

    // --- Test 5: Home seeks to 0 ---
    seekToTime.mock.resetCalls()
    home!.handler()
    expect(seekToTime.mock.calls.length).toBe(1)
    expect(seekToTime.mock.calls[0]?.arguments[0]).toBe(0)

    // --- Test 6: End seeks to duration ---
    seekToTime.mock.resetCalls()
    getDuration.mock.mockImplementation(() => 30000)
    end!.handler()
    expect(seekToTime.mock.calls.length).toBe(1)
    expect(seekToTime.mock.calls[0]?.arguments[0]).toBe(30000)

    // --- Test 7: Unmount calls shortcuts.reset() ---
    resetCalled = false
    seekToTime.mock.resetCalls()
    unmount()

    // After unmount, handlers should be no-ops (shortcuts.reset() clears
    // registered listeners by resetting the internal shortcuts array)
    expect(resetCalled).toBe(true)
  })

  it('shouldHandleEvent ignores input/textarea/select elements', async t => {
    // Reset state
    registeredShortcuts = []
    capturedShouldHandleEvent = undefined
    resetCalled = false
    seekToTime.mock.resetCalls()
    getElapsed.mock.mockImplementation(() => 10000)
    getDuration.mock.mockImplementation(() => 30000)

    t.mock.module('shortcuts', {
      namedExports: {
        Shortcuts: function MockShortcuts(this: any, options?: any) {
          if (options?.shouldHandleEvent) {
            capturedShouldHandleEvent = options.shouldHandleEvent
          }
          this.add = (descriptors: any) => {
            const arr = Array.isArray(descriptors) ? descriptors : [descriptors]
            registeredShortcuts.push(...arr)
          }
          this.reset = () => {
            registeredShortcuts = []
            resetCalled = true
          }
        },
      },
    })

    t.mock.module('../../hooks', {
      namedExports: {
        usePlayback: () => ({
          seekToTime,
          getElapsed,
          getDuration,
        }),
      },
    })

    t.mock.module('@repro/analytics', {
      namedExports: {
        Analytics: {
          track: mock.fn(),
        },
      },
    })

    const { PlaybackKeyboardShortcuts: Component } = await import(
      '../PlaybackKeyboardShortcuts.js'
    )

    render(<Component />)

    expect(capturedShouldHandleEvent).toBeDefined()

    // When no active element, should handle
    const fakeEvent = { type: 'keydown' } as KeyboardEvent
    expect(capturedShouldHandleEvent!(fakeEvent)).toBe(true)

    // When active element is an input, should NOT handle
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    expect(capturedShouldHandleEvent!(fakeEvent)).toBe(false)

    // When active element is a textarea, should NOT handle
    const textarea = document.createElement('textarea')
    document.body.appendChild(textarea)
    input.blur()
    textarea.focus()
    expect(capturedShouldHandleEvent!(fakeEvent)).toBe(false)

    // When active element is a select, should NOT handle
    const select = document.createElement('select')
    document.body.appendChild(select)
    textarea.blur()
    select.focus()
    expect(capturedShouldHandleEvent!(fakeEvent)).toBe(false)

    // Clean up
    document.body.removeChild(input)
    document.body.removeChild(textarea)
    document.body.removeChild(select)
    cleanup()
  })
})
