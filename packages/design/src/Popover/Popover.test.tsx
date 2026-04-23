import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import expect from 'expect'
import { afterEach, describe, it } from 'node:test'
import React from 'react'
import { PortalRootProvider } from '../Portal'
import { Popover } from './index'

afterEach(cleanup)

function renderPopover(props: React.ComponentProps<typeof Popover> = {}) {
  return render(
    <PortalRootProvider>
      <Popover {...props}>
        <Popover.Trigger>
          <button type="button">Trigger</button>
        </Popover.Trigger>
        <Popover.Content>
          <div>Popover content</div>
        </Popover.Content>
      </Popover>
      <button type="button">Outside</button>
    </PortalRootProvider>
  )
}

describe('Popover', () => {
  it('opens and closes from the trigger in uncontrolled mode', async () => {
    const user = userEvent.setup()
    renderPopover()

    await user.click(screen.getByRole('button', { name: 'Trigger' }))
    expect(screen.getByText('Popover content')).toBeDefined()

    await user.click(screen.getByRole('button', { name: 'Trigger' }))
    await waitFor(() => {
      expect(screen.queryByText('Popover content')).toBeNull()
    })
  })

  it('moves focus into the popover surface on open', async () => {
    const user = userEvent.setup()

    render(
      <PortalRootProvider>
        <Popover>
          <Popover.Trigger>
            <button type="button">Trigger</button>
          </Popover.Trigger>
          <Popover.Content role="menu" aria-label="Actions">
            <div>Popover content</div>
          </Popover.Content>
        </Popover>
      </PortalRootProvider>
    )

    await user.click(screen.getByRole('button', { name: 'Trigger' }))

    expect(document.activeElement).toBe(
      screen.getByRole('menu', { name: 'Actions' })
    )
    expect(screen.getByRole('menu', { name: 'Actions' })).toBeDefined()
  })

  it('passes popup semantics through to the trigger and content surfaces', async () => {
    const user = userEvent.setup()

    render(
      <PortalRootProvider>
        <Popover>
          <Popover.Trigger aria-haspopup="grid">
            <button type="button">Trigger</button>
          </Popover.Trigger>
          <Popover.Content role="dialog" aria-label="Filters">
            <div>Popover content</div>
          </Popover.Content>
        </Popover>
      </PortalRootProvider>
    )

    const trigger = screen.getByRole('button', { name: 'Trigger' })
    expect(trigger.getAttribute('aria-haspopup')).toBe('grid')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')

    await user.click(trigger)

    expect(screen.getByRole('dialog', { name: 'Filters' })).toBeDefined()
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
  })

  it('emits onOpenChange in controlled mode without mutating parent state', async () => {
    const user = userEvent.setup()
    const changes: boolean[] = []

    const { rerender } = render(
      <PortalRootProvider>
        <Popover open={false} onOpenChange={open => changes.push(open)}>
          <Popover.Trigger>
            <button type="button">Trigger</button>
          </Popover.Trigger>
          <Popover.Content>
            <div>Popover content</div>
          </Popover.Content>
        </Popover>
      </PortalRootProvider>
    )

    await user.click(screen.getByRole('button', { name: 'Trigger' }))
    expect(changes).toEqual([true])
    expect(screen.queryByText('Popover content')).toBeNull()

    rerender(
      <PortalRootProvider>
        <Popover open={true} onOpenChange={open => changes.push(open)}>
          <Popover.Trigger>
            <button type="button">Trigger</button>
          </Popover.Trigger>
          <Popover.Content>
            <div>Popover content</div>
          </Popover.Content>
        </Popover>
      </PortalRootProvider>
    )

    expect(screen.getByText('Popover content')).toBeDefined()
  })

  it('dismisses on Escape and restores focus to the trigger', async () => {
    const user = userEvent.setup()

    render(
      <PortalRootProvider>
        <Popover>
          <Popover.Trigger>
            <button type="button">Trigger</button>
          </Popover.Trigger>
          <Popover.Content role="menu" aria-label="Actions">
            <button type="button" autoFocus>
              Inner action
            </button>
          </Popover.Content>
        </Popover>
        <button type="button">Outside</button>
      </PortalRootProvider>
    )

    const trigger = screen.getByRole('button', { name: 'Trigger' })
    await user.click(trigger)

    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Inner action' })
    )

    await user.keyboard('{Escape}')

    await waitFor(() => {
      expect(screen.queryByText('Popover content')).toBeNull()
    })
    expect(document.activeElement).toBe(trigger)
  })

  it('dismisses when clicking outside the popover', async () => {
    const user = userEvent.setup()
    renderPopover()

    await user.click(screen.getByRole('button', { name: 'Trigger' }))
    expect(screen.getByText('Popover content')).toBeDefined()

    const outside = screen.getByRole('button', { name: 'Outside' })
    await user.click(outside)
    await waitFor(() => {
      expect(screen.queryByText('Popover content')).toBeNull()
    })
    expect(document.activeElement).toBe(outside)
  })

  it('renders content through the portal root', async () => {
    const user = userEvent.setup()
    const { container } = renderPopover()
    const trigger = screen.getByRole('button', { name: 'Trigger' })

    await user.click(trigger)

    const content = screen.getByText('Popover content')
    expect(trigger.contains(content)).toBe(false)
    expect(container.contains(content)).toBe(true)
  })
})
