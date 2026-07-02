import { PortalRootProvider } from '@repro/design'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import expect from 'expect'
import { afterEach, describe, it, mock } from 'node:test'
import React from 'react'
import { PlaybackState } from '../../types'

afterEach(cleanup)

describe('PlayAction', () => {
  it('renders accessible name, tooltip, icons, and click toggles playback', async t => {
    const pause = mock.fn()
    const play = mock.fn()
    const seekToTime = mock.fn()
    const getElapsed = mock.fn(() => 10000)
    const getDuration = mock.fn(() => 30000)
    // Start in Paused state (PlaybackState.Paused = 1)
    let playbackState: PlaybackState = PlaybackState.Paused
    const showHud = mock.fn()

    const mockPlayback = {
      pause,
      play,
      seekToTime,
      getElapsed,
      getDuration,
      getPlaybackState: () => playbackState,
    }

    t.mock.module('../../hooks', {
      exports: {
        usePlayback: () => mockPlayback,
      },
    })

    // The component imports usePlaybackState from '..' which resolves to ../../index
    t.mock.module('../../index', {
      exports: {
        usePlayback: () => mockPlayback,
        usePlaybackState: () => playbackState,
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

    const { PlayAction } = await import('../PlayAction.js')

    // --- Test 1: Accessible name ---
    render(
      <PortalRootProvider>
        <PlayAction />
      </PortalRootProvider>
    )

    const trigger = screen.getByLabelText('Play / Pause (Space)')
    expect(trigger).toBeDefined()

    // --- Test 2: Tooltip shows keycap and description ---
    fireEvent.pointerEnter(trigger)
    const tooltip = await screen.findByRole('tooltip')
    expect(tooltip.getAttribute('aria-hidden')).toBe('false')
    expect(tooltip.textContent).toContain('Play / Pause')
    expect(tooltip.textContent).toContain('Space')

    // --- Test 3: Icon renders (paused -> PlayIcon via lucide) ---
    const playIcon = trigger.querySelector('svg')
    expect(playIcon).toBeDefined()

    // --- Test 4: Click calls play() (component was paused) ---
    fireEvent.click(trigger)
    expect(play.mock.calls.length).toBe(1)

    // --- Test 5: Playing state shows PauseIcon and calls pause() ---
    playbackState = PlaybackState.Playing
    cleanup()

    render(
      <PortalRootProvider>
        <PlayAction />
      </PortalRootProvider>
    )

    const triggerPlaying = screen.getByLabelText('Play / Pause (Space)')
    expect(triggerPlaying).toBeDefined()

    const pauseIcon = triggerPlaying.querySelector('svg')
    expect(pauseIcon).toBeDefined()

    fireEvent.click(triggerPlaying)
    expect(pause.mock.calls.length).toBe(1)

    cleanup()
  })
})
