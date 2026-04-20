import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import expect from 'expect'
import { afterEach, describe, it } from 'node:test'
import React, { useState } from 'react'
import { Collapsible } from './index'

afterEach(() => {
  cleanup()
  window.matchMedia = originalMatchMedia
})

const originalMatchMedia = window.matchMedia

function pressKey(key: string, target?: Element) {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
  })
  ;(target ?? document.activeElement ?? document).dispatchEvent(event)
  return event
}

describe('Collapsible', () => {
  it('toggles content open and closed', async () => {
    const user = userEvent.setup()

    render(
      <Collapsible defaultOpen={false}>
        <Collapsible.Trigger>Details</Collapsible.Trigger>
        <Collapsible.Content>Panel content</Collapsible.Content>
      </Collapsible>
    )

    const trigger = screen.getByRole('button', { name: 'Details' })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('region')).toBeNull()

    await user.click(trigger)

    const content = screen.getByRole('region')

    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('Panel content')).toBeDefined()

    await user.click(trigger)

    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(screen.getByRole('region', { hidden: true })).toBe(content)
  })

  it('supports controlled open state', async () => {
    const user = userEvent.setup()

    function Wrapper() {
      const [open, setOpen] = useState(false)
      return (
        <Collapsible open={open} onOpenChange={setOpen}>
          <Collapsible.Trigger>Controlled</Collapsible.Trigger>
          <Collapsible.Content>Controlled content</Collapsible.Content>
        </Collapsible>
      )
    }

    render(<Wrapper />)

    const trigger = screen.getByRole('button', { name: 'Controlled' })

    expect(trigger.getAttribute('aria-expanded')).toBe('false')

    await user.click(trigger)

    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('Controlled content')).toBeDefined()
  })

  it('disables the trigger when requested', async () => {
    const user = userEvent.setup()

    render(
      <Collapsible defaultOpen={false} disabled>
        <Collapsible.Trigger>Disabled</Collapsible.Trigger>
        <Collapsible.Content>Hidden content</Collapsible.Content>
      </Collapsible>
    )

    const trigger = screen.getByRole('button', { name: 'Disabled' })

    expect(trigger.hasAttribute('disabled')).toBe(true)

    await user.click(trigger)

    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('region')).toBeNull()
  })

  it('keeps the collapsing content mounted until the transition ends', async () => {
    const user = userEvent.setup()

    render(
      <Collapsible defaultOpen>
        <Collapsible.Trigger>Lifecycle</Collapsible.Trigger>
        <Collapsible.Content>Lifecycle content</Collapsible.Content>
      </Collapsible>
    )

    const trigger = screen.getByRole('button', { name: 'Lifecycle' })
    const content = screen.getByRole('region')

    await user.click(trigger)

    expect(screen.getByText('Lifecycle content')).toBeDefined()
    expect(content.hasAttribute('inert')).toBe(true)

    fireEvent.transitionEnd(content)

    expect(screen.queryByRole('region', { hidden: true })).toBeNull()
  })

  it('unmounts immediately when reduced motion is preferred', async () => {
    const user = userEvent.setup()
    window.matchMedia = ((query: string) =>
      ({
        matches: query.includes('prefers-reduced-motion'),
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList) as typeof window.matchMedia

    render(
      <Collapsible defaultOpen>
        <Collapsible.Trigger>Motion</Collapsible.Trigger>
        <Collapsible.Content>Motion content</Collapsible.Content>
      </Collapsible>
    )

    const trigger = screen.getByRole('button', { name: 'Motion' })

    await user.click(trigger)

    expect(screen.queryByRole('region')).toBeNull()
  })

  it('wires trigger and content ids together', () => {
    render(
      <Collapsible defaultOpen>
        <Collapsible.Trigger>Linked</Collapsible.Trigger>
        <Collapsible.Content>Linked content</Collapsible.Content>
      </Collapsible>
    )

    const trigger = screen.getByRole('button', { name: 'Linked' })
    const content = screen.getByRole('region')

    expect(trigger.getAttribute('aria-controls')).toBe(content.id)
    expect(content.getAttribute('aria-labelledby')).toBe(trigger.id)
  })
})
