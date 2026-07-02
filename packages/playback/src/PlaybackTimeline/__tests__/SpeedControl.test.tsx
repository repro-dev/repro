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

    // Hover to show tooltip
    fireEvent.pointerEnter(trigger)

    // Wait for tooltip content to appear
    await waitFor(() => {
      expect(screen.getByText('Playback speed')).toBeDefined()
    })

    // Keycap hints present
    expect(screen.getByText('=')).toBeDefined()
    expect(screen.getByText('-')).toBeDefined()
    expect(screen.getByText('increase')).toBeDefined()
    expect(screen.getByText('decrease')).toBeDefined()

    // No `+` advertised
    expect(screen.queryByText('+')).toBeNull()

    cleanup()
  })
})
