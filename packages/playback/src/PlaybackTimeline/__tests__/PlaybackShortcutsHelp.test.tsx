import { PortalRootProvider } from '@repro/design'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import expect from 'expect'
import { afterEach, describe, it } from 'node:test'
import React from 'react'

afterEach(cleanup)

/**
 * Open the popover by clicking the trigger.
 * Mirrors the interaction pattern used in @repro/design Popover tests.
 */
function openPopover(trigger: HTMLElement) {
  trigger.focus()
  fireEvent.pointerDown(trigger)
  fireEvent.mouseDown(trigger)
  fireEvent.click(trigger)
}

describe('PlaybackShortcutsHelp', () => {
  it('renders trigger with accessible name and starts collapsed', async () => {
    const { PlaybackShortcutsHelp } = await import(
      '../PlaybackShortcutsHelp.js'
    )

    render(
      <PortalRootProvider>
        <PlaybackShortcutsHelp />
      </PortalRootProvider>
    )

    const trigger = screen.getByLabelText('Keyboard shortcuts')
    expect(trigger).toBeDefined()
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })

  it('opens popover on click and shows all 7 shortcuts', async () => {
    const { PlaybackShortcutsHelp } = await import(
      '../PlaybackShortcutsHelp.js'
    )

    render(
      <PortalRootProvider>
        <PlaybackShortcutsHelp />
      </PortalRootProvider>
    )

    const trigger = screen.getByLabelText('Keyboard shortcuts')
    openPopover(trigger)

    expect(trigger.getAttribute('aria-expanded')).toBe('true')

    const dialog = screen.getByRole('dialog', {
      name: 'Playback keyboard shortcuts',
    })
    expect(dialog).toBeDefined()

    // All 7 shortcuts must be listed with correct glyphs
    expect(screen.getByText('Space')).toBeDefined()
    expect(screen.getByText('Play / Pause')).toBeDefined()
    expect(screen.getByText('←')).toBeDefined()
    expect(screen.getByText('Seek backward 5s')).toBeDefined()
    expect(screen.getByText('→')).toBeDefined()
    expect(screen.getByText('Seek forward 5s')).toBeDefined()
    expect(screen.getByText('Home')).toBeDefined()
    expect(screen.getByText('Jump to start')).toBeDefined()
    expect(screen.getByText('End')).toBeDefined()
    expect(screen.getByText('Jump to end')).toBeDefined()
    expect(screen.getByText('=')).toBeDefined()
    expect(screen.queryByText('+ / =')).toBeNull()
    expect(screen.getByText('Increase speed')).toBeDefined()
    expect(screen.getByText('-')).toBeDefined()
    expect(screen.getByText('Decrease speed')).toBeDefined()

    // Typo glyph * must NOT be present (regression guard)
    expect(screen.queryByText('*')).toBeNull()
  })

  it('has content with correct accessible name', async () => {
    const { PlaybackShortcutsHelp } = await import(
      '../PlaybackShortcutsHelp.js'
    )

    render(
      <PortalRootProvider>
        <PlaybackShortcutsHelp />
      </PortalRootProvider>
    )

    const trigger = screen.getByLabelText('Keyboard shortcuts')
    openPopover(trigger)

    // PopoverContent must have an accessible name
    const dialog = screen.getByRole('dialog', {
      name: 'Playback keyboard shortcuts',
    })
    expect(dialog).toBeDefined()
  })

  it('dismisses on Escape (aria-expanded becomes false)', async () => {
    const { PlaybackShortcutsHelp } = await import(
      '../PlaybackShortcutsHelp.js'
    )

    render(
      <PortalRootProvider>
        <PlaybackShortcutsHelp />
      </PortalRootProvider>
    )

    const trigger = screen.getByLabelText('Keyboard shortcuts')
    openPopover(trigger)

    const dialog = screen.getByRole('dialog', {
      name: 'Playback keyboard shortcuts',
    })
    expect(dialog).toBeDefined()

    // Dispatch Escape on the dialog content (floating-ui's useDismiss listens here)
    fireEvent.keyDown(dialog, { key: 'Escape', code: 'Escape' })

    // In jsdom, CSS transitions never fire transitionend automatically,
    // so floating-ui's useTransitionStyles keeps isMounted=true.
    // We fire the native transitionend event on the animated surface to
    // trigger the close completion, then verify aria-expanded.
    const animated = dialog.querySelector('[style*="transition"]')
    if (animated) {
      fireEvent.transitionEnd(animated, { propertyName: 'opacity' })
    }

    await waitFor(() => {
      expect(trigger.getAttribute('aria-expanded')).toBe('false')
    })
  })

  it('dismisses on second trigger click (toggle)', async () => {
    const { PlaybackShortcutsHelp } = await import(
      '../PlaybackShortcutsHelp.js'
    )

    render(
      <PortalRootProvider>
        <PlaybackShortcutsHelp />
      </PortalRootProvider>
    )

    const trigger = screen.getByLabelText('Keyboard shortcuts')
    openPopover(trigger)
    expect(
      screen.getByRole('dialog', { name: 'Playback keyboard shortcuts' })
    ).toBeDefined()

    // Second click to close
    openPopover(trigger)

    const dialog = screen.queryByRole('dialog', {
      name: 'Playback keyboard shortcuts',
    })
    if (dialog) {
      const animated = dialog.querySelector('[style*="transition"]')
      if (animated) {
        fireEvent.transitionEnd(animated, { propertyName: 'opacity' })
      }
    }

    await waitFor(() => {
      expect(trigger.getAttribute('aria-expanded')).toBe('false')
    })
  })

  it('dismisses on outside click', async () => {
    const { PlaybackShortcutsHelp } = await import(
      '../PlaybackShortcutsHelp.js'
    )

    render(
      <PortalRootProvider>
        <PlaybackShortcutsHelp />
        <button type="button">Outside</button>
      </PortalRootProvider>
    )

    const trigger = screen.getByLabelText('Keyboard shortcuts')
    openPopover(trigger)
    expect(
      screen.getByRole('dialog', { name: 'Playback keyboard shortcuts' })
    ).toBeDefined()

    // Click outside button
    const outside = screen.getByRole('button', { name: 'Outside' })
    outside.focus()
    fireEvent.pointerDown(outside)
    fireEvent.mouseDown(outside)
    fireEvent.click(outside)

    const dialog = screen.queryByRole('dialog', {
      name: 'Playback keyboard shortcuts',
    })
    if (dialog) {
      const animated = dialog.querySelector('[style*="transition"]')
      if (animated) {
        fireEvent.transitionEnd(animated, { propertyName: 'opacity' })
      }
    }

    await waitFor(() => {
      expect(trigger.getAttribute('aria-expanded')).toBe('false')
    })
  })

  it('SimpleTimeline smoke: renders with no new required props', async t => {
    // Mock the hooks module that SimpleTimeline and its children import.
    // t.mock.module specifier is resolved relative to the test file.
    // PlaybackKeyboardShortcuts test (sibling) uses t.mock.module('../../hooks')
    // which resolves to packages/playback/src/hooks.ts from this test file location.
    t.mock.module('../../hooks', {
      exports: {
        usePlayback: () => {
          const mockAtom = {
            pipe: () => ({
              subscribe: () => ({ unsubscribe: () => {} }),
            }),
          }
          return {
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
        },
        usePlaybackState: () => 0,
        useSpeed: () => 1,
      },
    })

    // Also mock the index barrel that PlayAction imports from ('..' -> index.ts -> hooks.ts)
    t.mock.module('../../index', {
      exports: {
        usePlayback: () => {
          const mockAtom = {
            pipe: () => ({
              subscribe: () => ({ unsubscribe: () => {} }),
            }),
          }
          return {
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
        },
        usePlaybackState: () => 0,
        useSpeed: () => 1,
      },
    })

    t.mock.module('@repro/analytics', {
      exports: {
        Analytics: { track: () => {} },
      },
    })

    const { SimpleTimeline } = await import('../SimpleTimeline.js')

    const { container } = render(
      <PortalRootProvider>
        <SimpleTimeline />
      </PortalRootProvider>
    )

    // Verify that SimpleTimeline renders without error
    expect(container.firstChild).not.toBeNull()
  })
})
