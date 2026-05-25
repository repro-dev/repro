import { Row } from '@jsxstyle/react'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import expect from 'expect'
import { afterEach, describe, it } from 'node:test'
import React from 'react'
import { Button } from '../Button'
import { PortalRootProvider } from '../Portal'
import { Popover, PopoverArrow, PopoverContent, PopoverTrigger } from './index'

afterEach(cleanup)

function openPopover(trigger: HTMLElement) {
  trigger.focus()
  fireEvent.pointerDown(trigger)
  fireEvent.mouseDown(trigger)
  fireEvent.click(trigger)
}

function renderPopover(props: React.ComponentProps<typeof Popover> = {}) {
  return render(
    <PortalRootProvider>
      <Popover {...props}>
        <Popover.Trigger>
          <button type="button">Trigger</button>
        </Popover.Trigger>
        <Popover.Content aria-label="Example popover">
          <div>Popover content</div>
        </Popover.Content>
      </Popover>
      <button type="button">Outside</button>
    </PortalRootProvider>
  )
}

function mockElementRect(element: HTMLElement, rect: DOMRectInit) {
  const domRect = DOMRect.fromRect(rect)
  element.getBoundingClientRect = () => domRect
  element.getClientRects = () =>
    ({
      0: domRect,
      length: 1,
      item: index => (index === 0 ? domRect : null),
      [Symbol.iterator]: function* () {
        yield domRect
      },
    }) as DOMRectList
}

describe('Popover', () => {
  it('opens and closes from the trigger in uncontrolled mode', async () => {
    renderPopover()

    const trigger = screen.getByRole('button', { name: 'Trigger' })
    openPopover(trigger)
    expect(screen.getByText('Popover content')).toBeDefined()

    openPopover(trigger)
    await waitFor(() => {
      expect(screen.queryByText('Popover content')).toBeNull()
    })
  })

  it('does not default the trigger to menu semantics', () => {
    renderPopover()

    expect(
      screen
        .getByRole('button', { name: 'Trigger' })
        .getAttribute('aria-haspopup')
    ).toBeNull()
  })

  it('exports compound parts as named runtime values', () => {
    expect(PopoverTrigger).toBe(Popover.Trigger)
    expect(PopoverContent).toBe(Popover.Content)
    expect(PopoverArrow).toBe(Popover.Arrow)
  })

  it('defaults opened content to dialog semantics', () => {
    renderPopover()

    openPopover(screen.getByRole('button', { name: 'Trigger' }))

    const content = screen.getByRole('dialog', { name: 'Example popover' })
    expect(content.getAttribute('aria-modal')).toBeNull()
  })

  it('renders non-element trigger children as a semantic button', () => {
    render(
      <PortalRootProvider>
        <Popover>
          <Popover.Trigger>Open text popover</Popover.Trigger>
          <Popover.Content aria-label="Text trigger popover">
            <div>Popover content</div>
          </Popover.Content>
        </Popover>
      </PortalRootProvider>
    )

    const trigger = screen.getByRole('button', { name: 'Open text popover' })
    expect(trigger.getAttribute('type')).toBe('button')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')

    openPopover(trigger)

    expect(
      screen.getByRole('dialog', { name: 'Text trigger popover' })
    ).toBeDefined()
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
  })

  it('keeps floating positioning transform separate from surface animation transform', () => {
    renderPopover()

    openPopover(screen.getByRole('button', { name: 'Trigger' }))

    const positioned = screen.getByRole('dialog', { name: 'Example popover' })
    const surface = positioned.firstElementChild as HTMLElement | null
    expect(surface).toBeDefined()
    expect(positioned.style.position).toBe('fixed')
    expect(positioned.style.transform).toContain('translate')
    expect(surface?.style.transform).toContain('scale')
  })

  it('moves focus into the popover surface on open', async () => {
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

    openPopover(screen.getByRole('button', { name: 'Trigger' }))

    await waitFor(() => {
      expect(document.activeElement).toBe(
        screen.getByRole('menu', { name: 'Actions' })
      )
    })
  })

  it('preserves explicit popup semantics and plain trigger handlers', () => {
    const clicks: string[] = []

    render(
      <PortalRootProvider>
        <Popover>
          <Popover.Trigger aria-haspopup="grid">
            <button type="button" onClick={() => clicks.push('child')}>
              Trigger
            </button>
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

    openPopover(trigger)

    expect(screen.getByRole('dialog', { name: 'Filters' })).toBeDefined()
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(clicks).toEqual(['child'])
  })

  it('preserves props-bag child handlers for jsxstyle triggers', () => {
    const clicks: string[] = []

    render(
      <PortalRootProvider>
        <Popover>
          <Popover.Trigger>
            <Row
              component="button"
              props={{
                type: 'button',
                onClick: () => clicks.push('child'),
              }}
            >
              Trigger
            </Row>
          </Popover.Trigger>
          <Popover.Content role="dialog" aria-label="Filters">
            <div>Popover content</div>
          </Popover.Content>
        </Popover>
      </PortalRootProvider>
    )

    const trigger = screen.getByRole('button', { name: 'Trigger' })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')

    openPopover(trigger)

    expect(screen.getByRole('dialog', { name: 'Filters' })).toBeDefined()
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(clicks).toEqual(['child'])
  })

  it('preserves popup semantics when the trigger is a Button', () => {
    const clicks: string[] = []

    render(
      <PortalRootProvider>
        <Popover>
          <Popover.Trigger aria-haspopup="menu">
            <Button onClick={() => clicks.push('child')}>Trigger</Button>
          </Popover.Trigger>
          <Popover.Content role="menu" aria-label="Actions">
            <div>Popover content</div>
          </Popover.Content>
        </Popover>
      </PortalRootProvider>
    )

    const trigger = screen.getByRole('button', { name: 'Trigger' })
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    trigger.focus()
    expect(document.activeElement).toBe(trigger)

    openPopover(trigger)

    expect(screen.getByRole('menu', { name: 'Actions' })).toBeDefined()
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(clicks).toEqual(['child'])
  })

  it('opens Button-triggered popovers from keyboard activation', async () => {
    const user = userEvent.setup()

    render(
      <PortalRootProvider>
        <Popover>
          <Popover.Trigger aria-haspopup="menu">
            <Button>Trigger</Button>
          </Popover.Trigger>
          <Popover.Content role="menu" aria-label="Actions">
            <div>Popover content</div>
          </Popover.Content>
        </Popover>
      </PortalRootProvider>
    )

    const trigger = screen.getByRole('button', { name: 'Trigger' })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    trigger.focus()

    await user.keyboard('{Enter}')

    await waitFor(() => {
      expect(trigger.getAttribute('aria-expanded')).toBe('true')
    })
    expect(screen.getByRole('menu', { name: 'Actions' })).toBeDefined()
  })

  it('positions Button-triggered popovers from a stable wrapper while the Button is active', async () => {
    render(
      <PortalRootProvider>
        <Popover>
          <Popover.Trigger>
            <Button>Trigger</Button>
          </Popover.Trigger>
          <Popover.Content aria-label="Stable popover">
            <div>Popover content</div>
          </Popover.Content>
        </Popover>
      </PortalRootProvider>
    )

    const trigger = screen.getByRole('button', { name: 'Trigger' })
    const stableAnchor = trigger.parentElement as HTMLElement | null
    expect(stableAnchor).toBeDefined()

    mockElementRect(stableAnchor!, {
      x: 20,
      y: 30,
      width: 80,
      height: 24,
    })
    mockElementRect(trigger, {
      x: 30,
      y: 34,
      width: 60,
      height: 16,
    })

    openPopover(trigger)

    const content = screen.getByRole('dialog', { name: 'Stable popover' })
    await waitFor(() => {
      expect(content.style.transform).toBe('translate(8px, 26px)')
    })
  })

  it('emits onOpenChange in controlled mode without mutating parent state', () => {
    const changes: boolean[] = []

    const { rerender } = render(
      <PortalRootProvider>
        <Popover open={false} onOpenChange={open => changes.push(open)}>
          <Popover.Trigger>
            <button type="button">Trigger</button>
          </Popover.Trigger>
          <Popover.Content aria-label="Controlled popover">
            <div>Popover content</div>
          </Popover.Content>
        </Popover>
      </PortalRootProvider>
    )

    openPopover(screen.getByRole('button', { name: 'Trigger' }))
    expect(changes).toEqual([true])
    expect(screen.queryByText('Popover content')).toBeNull()

    rerender(
      <PortalRootProvider>
        <Popover open={true} onOpenChange={open => changes.push(open)}>
          <Popover.Trigger>
            <button type="button">Trigger</button>
          </Popover.Trigger>
          <Popover.Content aria-label="Controlled popover">
            <div>Popover content</div>
          </Popover.Content>
        </Popover>
      </PortalRootProvider>
    )

    expect(screen.getByText('Popover content')).toBeDefined()
  })

  it('dismisses on Escape and restores focus to the trigger', async () => {
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
    openPopover(trigger)

    await waitFor(() => {
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Inner action' })
      )
    })

    fireEvent.keyDown(screen.getByRole('button', { name: 'Inner action' }), {
      key: 'Escape',
      code: 'Escape',
    })

    await waitFor(() => {
      expect(trigger.getAttribute('aria-expanded')).toBe('false')
    })
    expect(document.activeElement).toBe(trigger)
  })

  it('dismisses when clicking outside the popover', async () => {
    renderPopover()

    const trigger = screen.getByRole('button', { name: 'Trigger' })
    openPopover(trigger)
    expect(screen.getByText('Popover content')).toBeDefined()

    const outside = screen.getByRole('button', { name: 'Outside' })
    outside.focus()
    fireEvent.pointerDown(outside)
    fireEvent.mouseDown(outside)
    fireEvent.click(outside)
    await waitFor(() => {
      expect(trigger.getAttribute('aria-expanded')).toBe('false')
    })
    expect(document.activeElement).toBe(outside)
  })

  it('renders content through the portal root', async () => {
    const { container } = renderPopover()
    const trigger = screen.getByRole('button', { name: 'Trigger' })

    openPopover(trigger)

    const content = screen.getByText('Popover content')
    expect(trigger.contains(content)).toBe(false)
    expect(container.contains(content)).toBe(true)
  })
})
