import { PortalRootProvider } from '@repro/design'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import expect from 'expect'
import { afterEach, describe, it, mock } from 'node:test'
import React from 'react'

afterEach(cleanup)

describe('SpeedControl', () => {
  it('tooltip shows keycaps and description', async t => {
    const setSpeed = mock.fn()
    const showHud = mock.fn()

    t.mock.module('../../hooks', {
      exports: {
        usePlayback: () => ({
          setSpeed,
          getSpeed: () => 1,
          getPlaybackState: () => 0,
        }),
        useSpeed: () => 1,
      },
    })

    t.mock.module('../../index', {
      exports: {
        usePlayback: () => ({
          setSpeed,
          getSpeed: () => 1,
          getPlaybackState: () => 0,
        }),
        usePlaybackState: () => 0,
        useSpeed: () => 1,
      },
    })

    t.mock.module('../keyboardIgnore', {
      exports: {
        shouldIgnoreKeyboardEvent: () => false,
      },
    })

    t.mock.module('@repro/analytics', {
      exports: {
        Analytics: {
          track: mock.fn(),
        },
      },
    })

    t.mock.module('../../PlaybackCanvas/PlaybackHudContext', {
      exports: {
        usePlaybackHud: () => ({ showHud }),
      },
    })

    const { SpeedControl } = await import('../SpeedControl.js')

    render(
      <PortalRootProvider>
        <SpeedControl />
      </PortalRootProvider>
    )

    // Find the speed control element (shows "1.0x")
    const trigger = screen.getByText('1.0x')
    expect(trigger).toBeDefined()

    // Tooltip exists in DOM but is aria-hidden initially
    const tooltip = document.querySelector('[role="tooltip"]')
    expect(tooltip).not.toBeNull()
    expect(tooltip!.getAttribute('aria-hidden')).toBe('true')

    // Hover to show tooltip
    fireEvent.pointerEnter(trigger)

    // Wait for tooltip to become visible
    await waitFor(() => {
      expect(tooltip!.getAttribute('aria-hidden')).toBe('false')
    })

    // Keycap hints present
    expect(tooltip!.textContent).toContain('Playback speed')
    expect(tooltip!.textContent).toContain('=')
    expect(tooltip!.textContent).toContain('-')
    expect(tooltip!.textContent).toContain('increase')
    expect(tooltip!.textContent).toContain('decrease')

    // No `+` advertised
    expect(tooltip!.textContent).not.toContain('+')

    cleanup()
  })
})
