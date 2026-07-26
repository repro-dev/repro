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
import { PlaybackShortcutsHelp } from '../PlaybackShortcutsHelp'

afterEach(cleanup)

describe('PlaybackShortcutsHelp', () => {
  it('renders trigger with accessible name and starts collapsed', () => {
    render(
      <PortalRootProvider>
        <PlaybackShortcutsHelp />
      </PortalRootProvider>
    )

    // The PopoverTrigger clones the outer Row, so aria-expanded is on the parent
    const innerRow = screen.getByLabelText('Keyboard shortcuts')
    const trigger = innerRow.parentElement!
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })

  it('opens popover on click showing all 7 shortcuts with correct glyphs', async () => {
    render(
      <PortalRootProvider>
        <PlaybackShortcutsHelp />
      </PortalRootProvider>
    )

    const innerRow = screen.getByLabelText('Keyboard shortcuts')
    const trigger = innerRow.parentElement!
    fireEvent.click(trigger)

    await waitFor(() => {
      expect(trigger.getAttribute('aria-expanded')).toBe('true')
    })

    const popover = screen.getByRole('dialog', {
      name: 'Playback keyboard shortcuts',
    })
    expect(popover).toBeDefined()

    // Verify each keycap glyph is shown
    expect(screen.getByText('Space')).toBeDefined()
    expect(screen.getByText('←')).toBeDefined()
    expect(screen.getByText('→')).toBeDefined()
    expect(screen.getByText('Home')).toBeDefined()
    expect(screen.getByText('End')).toBeDefined()
    expect(screen.getByText('+')).toBeDefined()
    expect(screen.getByText('-')).toBeDefined()

    // Verify = and * are NOT shown
    expect(screen.queryByText('=')).toBeNull()
    expect(screen.queryByText('*')).toBeNull()

    // Verify action descriptions
    expect(screen.getByText('Play / Pause')).toBeDefined()
    expect(screen.getByText('Seek backward 5s')).toBeDefined()
    expect(screen.getByText('Seek forward 5s')).toBeDefined()
    expect(screen.getByText('Jump to start')).toBeDefined()
    expect(screen.getByText('Jump to end')).toBeDefined()
    expect(screen.getByText('Increase speed')).toBeDefined()
    expect(screen.getByText('Decrease speed')).toBeDefined()
  })

  it('closes popover on Escape key', async () => {
    render(
      <PortalRootProvider>
        <PlaybackShortcutsHelp />
      </PortalRootProvider>
    )

    const innerRow = screen.getByLabelText('Keyboard shortcuts')
    const trigger = innerRow.parentElement!

    fireEvent.click(trigger)
    await waitFor(() => {
      expect(trigger.getAttribute('aria-expanded')).toBe('true')
    })

    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: 'Escape',
      code: 'Escape',
    })

    await waitFor(() => {
      expect(trigger.getAttribute('aria-expanded')).toBe('false')
    })
  })

  it('toggles closed on second trigger click', async () => {
    render(
      <PortalRootProvider>
        <PlaybackShortcutsHelp />
      </PortalRootProvider>
    )

    const innerRow = screen.getByLabelText('Keyboard shortcuts')
    const trigger = innerRow.parentElement!

    fireEvent.click(trigger)
    await waitFor(() => {
      expect(trigger.getAttribute('aria-expanded')).toBe('true')
    })

    fireEvent.click(trigger)
    await waitFor(() => {
      expect(trigger.getAttribute('aria-expanded')).toBe('false')
    })
  })
})
