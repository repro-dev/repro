import { cleanup, render } from '@testing-library/react'
import expect from 'expect'
import { describe, it, mock } from 'node:test'
import React from 'react'

const seekToTime = mock.fn()
const getElapsed = mock.fn(() => 10000)
const getDuration = mock.fn(() => 30000)
let ignoreFn: (event: KeyboardEvent) => boolean = () => false

describe('PlaybackKeyboardShortcuts', () => {
  it('registers keyboard shortcuts, calls playback methods, handles unmount and focus filter', async t => {
    t.mock.module('../keyboardIgnore', {
      namedExports: {
        shouldIgnoreKeyboardEvent: (event: KeyboardEvent) => {
          return ignoreFn(event)
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

    const { PlaybackKeyboardShortcuts } = await import(
      '../PlaybackKeyboardShortcuts.js'
    )

    const { Analytics } = await import('@repro/analytics')
    const analyticsTrack = Analytics.track as ReturnType<typeof mock.fn>

    // --- Mount: ignore nothing, all shortcuts fire ---
    ignoreFn = () => false
    const { unmount, container } = render(<PlaybackKeyboardShortcuts />)
    expect(container.innerHTML).toBe('')

    const fire = (key: string) =>
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key, code: key, bubbles: true })
      )

    // ArrowLeft: 10000 -> 5000
    analyticsTrack.mock.resetCalls()
    seekToTime.mock.resetCalls()
    getElapsed.mock.mockImplementation(() => 10000)
    fire('ArrowLeft')
    expect(seekToTime.mock.calls.length).toBe(1)
    expect(seekToTime.mock.calls[0]?.arguments[0]).toBe(5000)
    expect(analyticsTrack.mock.calls[0]?.arguments[0]).toBe(
      'playback:keyboard-seek-backward'
    )

    // ArrowLeft: clamped to 0 (3000 -> max(0, 3000-5000) = 0)
    analyticsTrack.mock.resetCalls()
    seekToTime.mock.resetCalls()
    getElapsed.mock.mockImplementation(() => 3000)
    fire('ArrowLeft')
    expect(seekToTime.mock.calls[0]?.arguments[0]).toBe(0)

    // ArrowRight: 10000 -> 15000
    analyticsTrack.mock.resetCalls()
    seekToTime.mock.resetCalls()
    getElapsed.mock.mockImplementation(() => 10000)
    getDuration.mock.mockImplementation(() => 30000)
    fire('ArrowRight')
    expect(seekToTime.mock.calls[0]?.arguments[0]).toBe(15000)
    expect(analyticsTrack.mock.calls[0]?.arguments[0]).toBe(
      'playback:keyboard-seek-forward'
    )

    // ArrowRight: clamped to duration (28000 -> min(30000, 28000+5000) = 30000)
    analyticsTrack.mock.resetCalls()
    seekToTime.mock.resetCalls()
    getElapsed.mock.mockImplementation(() => 28000)
    fire('ArrowRight')
    expect(seekToTime.mock.calls[0]?.arguments[0]).toBe(30000)

    // Home: seek to 0
    analyticsTrack.mock.resetCalls()
    seekToTime.mock.resetCalls()
    fire('Home')
    expect(seekToTime.mock.calls[0]?.arguments[0]).toBe(0)
    expect(analyticsTrack.mock.calls[0]?.arguments[0]).toBe(
      'playback:keyboard-seek-to-start'
    )

    // End: seek to duration
    analyticsTrack.mock.resetCalls()
    seekToTime.mock.resetCalls()
    getDuration.mock.mockImplementation(() => 30000)
    fire('End')
    expect(seekToTime.mock.calls[1]?.arguments[0]).toBeUndefined() // single call
    expect(seekToTime.mock.calls[0]?.arguments[0]).toBe(30000)
    expect(analyticsTrack.mock.calls[0]?.arguments[0]).toBe(
      'playback:keyboard-seek-to-end'
    )

    // --- Form element focus filter ---
    const input = document.createElement('input')
    document.body.appendChild(input)

    ignoreFn = (event: KeyboardEvent) => {
      let target = document.activeElement
      if (target?.shadowRoot) {
        target = target.shadowRoot.activeElement
      }
      return (
        event.repeat ||
        (!!target && (target as HTMLElement).matches?.('input,textarea,select'))
      )
    }

    // Input focused: should ignore
    input.focus()
    seekToTime.mock.resetCalls()
    fire('ArrowLeft')
    expect(seekToTime.mock.calls.length).toBe(0)

    // Input blurred: should fire
    input.blur()
    seekToTime.mock.resetCalls()
    fire('ArrowLeft')
    expect(seekToTime.mock.calls.length).toBe(1)

    // Shadow DOM input: should ignore
    seekToTime.mock.resetCalls()
    const shadowHost = document.createElement('div')
    document.body.appendChild(shadowHost)
    const shadowInput = document.createElement('input')
    Object.defineProperty(shadowHost, 'shadowRoot', {
      get() {
        return { activeElement: shadowInput }
      },
      configurable: true,
    })
    shadowHost.setAttribute('tabindex', '0')
    shadowHost.focus()
    fire('ArrowLeft')
    expect(seekToTime.mock.calls.length).toBe(0)

    // --- Unmount: shortcuts unregistered ---
    seekToTime.mock.resetCalls()
    ignoreFn = () => false
    unmount()
    fire('ArrowLeft')
    expect(seekToTime.mock.calls.length).toBe(0)

    document.body.removeChild(input)
    document.body.removeChild(shadowHost)
    cleanup()
  })
})
