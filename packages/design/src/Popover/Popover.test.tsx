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
    renderPopover()

    const trigger = screen.getByRole('button', { name: 'Trigger' })
    await user.click(trigger)

    const content = screen.getByText('Popover content')
    expect(document.activeElement).toBe(content.closest('[tabindex="-1"]'))

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

    await user.click(screen.getByRole('button', { name: 'Outside' }))
    await waitFor(() => {
      expect(screen.queryByText('Popover content')).toBeNull()
    })
  })

  it('renders content through the portal root', async () => {
    const user = userEvent.setup()
    const { container } = renderPopover()
    const trigger = screen.getByRole('button', { name: 'Trigger' })

    await user.click(trigger)

    const content = screen.getByText('Popover content')
    expect(trigger.parentElement?.contains(content)).toBe(false)
    expect(container.contains(content)).toBe(true)
  })
})
