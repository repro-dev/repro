import { PortalRootProvider } from '@repro/design'
import { cleanup, render, screen } from '@testing-library/react'
import expect from 'expect'
import { afterEach, describe, it } from 'node:test'
import React from 'react'

afterEach(cleanup)

describe('SimpleTimeline', () => {
  it('renders seeking keycap hints and no old popover', async t => {
    const mockAtom = {
      pipe: () => ({
        subscribe: () => ({ unsubscribe: () => {} }),
      }),
    }

    const mockPlayback = {
      seekToTime: () => {},
      getElapsed: () => 0,
      getDuration: () => 30000,
      getSpeed: () => 1,
      getPlaybackState: () => 0,
      play: () => {},
      pause: () => {},
      setSpeed: () => {},
      $playbackState: mockAtom,
      $latestControlFrame: mockAtom,
      $speed: mockAtom,
      $latestEventTime: mockAtom,
      $elapsed: mockAtom,
    }

    t.mock.module('../../hooks', {
      exports: {
        usePlayback: () => mockPlayback,
        usePlaybackState: () => 0,
        useSpeed: () => 1,
      },
    })

    t.mock.module('../../index', {
      exports: {
        usePlayback: () => mockPlayback,
        usePlaybackState: () => 0,
        useSpeed: () => 1,
      },
    })

    t.mock.module('@repro/analytics', {
      exports: {
        Analytics: { track: () => {} },
      },
    })

    t.mock.module('../keyboardIgnore', {
      exports: {
        shouldIgnoreKeyboardEvent: () => false,
      },
    })

    t.mock.module('../../PlaybackCanvas/PlaybackHudContext', {
      exports: {
        usePlaybackHud: () => ({ showHud: () => {} }),
      },
    })

    const { SimpleTimeline } = await import('../SimpleTimeline.js')

    const { container } = render(
      <PortalRootProvider>
        <SimpleTimeline />
      </PortalRootProvider>
    )

    // Smoke: renders without error
    expect(container.firstChild).not.toBeNull()

    // --- Test 1: Seeking keycap hints are rendered ---
    expect(screen.getByText('←')).toBeDefined()
    expect(screen.getByText('→')).toBeDefined()
    expect(screen.getByText('Home')).toBeDefined()
    expect(screen.getByText('End')).toBeDefined()
    expect(screen.getByText('seek')).toBeDefined()
    expect(screen.getByText('start')).toBeDefined()
    expect(screen.getByText('end')).toBeDefined()

    // --- Test 2: Old popover is gone (no element with label "Keyboard shortcuts") ---
    expect(screen.queryByLabelText('Keyboard shortcuts')).toBeNull()

    cleanup()
  })
})
