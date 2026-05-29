import { cleanup, render } from '@testing-library/react'
import expect from 'expect'
import { afterEach, describe, it } from 'node:test'
import React, { act } from 'react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Collapsible,
} from '../index'

afterEach(cleanup)

function pressKey(key: string, target?: Element) {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
  })
  ;(target ?? document.activeElement ?? document).dispatchEvent(event)
}

function renderAccordion(
  props: {
    mode?: 'single' | 'multiple'
    value?: string | string[] | null
    defaultValue?: string | string[] | null
    onValueChange?: (value: string | string[] | null) => void
  } = {}
) {
  return render(
    <Accordion defaultValue={null} {...props}>
      <Accordion.Item value="billing">
        <Accordion.Trigger>Billing</Accordion.Trigger>
        <Accordion.Content>Billing content</Accordion.Content>
      </Accordion.Item>
      <Accordion.Item value="profile" disabled>
        <Accordion.Trigger>Profile</Accordion.Trigger>
        <Accordion.Content>Profile content</Accordion.Content>
      </Accordion.Item>
      <Accordion.Item value="security">
        <Accordion.Trigger>Security</Accordion.Trigger>
        <Accordion.Content>Security content</Accordion.Content>
      </Accordion.Item>
    </Accordion>
  )
}

function renderAccordionWithFocusedContent() {
  return render(
    <Accordion defaultValue="billing">
      <Accordion.Item value="billing">
        <Accordion.Trigger>Billing</Accordion.Trigger>
        <Accordion.Content>
          <label>
            Filter billing settings
            <input aria-label="Filter billing settings" />
          </label>
        </Accordion.Content>
      </Accordion.Item>
      <Accordion.Item value="security">
        <Accordion.Trigger>Security</Accordion.Trigger>
        <Accordion.Content>Security content</Accordion.Content>
      </Accordion.Item>
    </Accordion>
  )
}

describe('Accordion exports', () => {
  it('exposes compound parts and standalone Collapsible', () => {
    expect(Accordion).toBeDefined()
    expect(typeof Accordion.Item).toBe('object')
    expect(typeof Accordion.Trigger).toBe('object')
    expect(typeof Accordion.Content).toBe('object')
    expect(AccordionItem).toBe(Accordion.Item)
    expect(AccordionTrigger).toBe(Accordion.Trigger)
    expect(AccordionContent).toBe(Accordion.Content)
    expect(typeof Collapsible).toBe('object')
  })
})

describe('Accordion behavior', () => {
  it('single mode opens one item and replaces the open item', () => {
    renderAccordion({ defaultValue: 'billing' })

    const triggers = document.querySelectorAll<HTMLButtonElement>('button')
    const regions = document.querySelectorAll<HTMLElement>('[role="region"]')

    expect(triggers[0]!.getAttribute('aria-expanded')).toBe('true')
    act(() => {
      triggers[2]!.click()
    })

    expect(triggers[0]!.getAttribute('aria-expanded')).toBe('false')
    expect(triggers[2]!.getAttribute('aria-expanded')).toBe('true')
    expect(regions[0]!.getAttribute('aria-hidden')).toBe('true')
    expect(regions[2]!.getAttribute('aria-hidden')).toBe('false')
  })

  it('single mode closes the current open item', () => {
    renderAccordion({ defaultValue: 'billing' })

    const trigger = document.querySelectorAll<HTMLButtonElement>('button')[0]!
    act(() => {
      trigger.click()
    })

    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })

  it('multiple mode keeps multiple items open and closes one independently', () => {
    renderAccordion({ mode: 'multiple', defaultValue: ['billing'] })

    const triggers = document.querySelectorAll<HTMLButtonElement>('button')

    act(() => {
      triggers[2]!.click()
    })
    expect(triggers[0]!.getAttribute('aria-expanded')).toBe('true')
    expect(triggers[2]!.getAttribute('aria-expanded')).toBe('true')

    act(() => {
      triggers[0]!.click()
    })
    expect(triggers[0]!.getAttribute('aria-expanded')).toBe('false')
    expect(triggers[2]!.getAttribute('aria-expanded')).toBe('true')
  })

  it('controlled mode calls onValueChange without mutating itself', () => {
    let requested: string | string[] | null = null

    renderAccordion({
      value: 'billing',
      onValueChange: value => {
        requested = value
      },
    })

    const triggers = document.querySelectorAll<HTMLButtonElement>('button')
    act(() => {
      triggers[2]!.click()
    })

    expect(requested).toBe('security')
    expect(triggers[0]!.getAttribute('aria-expanded')).toBe('true')
    expect(triggers[2]!.getAttribute('aria-expanded')).toBe('false')
  })

  it('disabled items do not toggle', () => {
    renderAccordion()

    const disabledTrigger =
      document.querySelectorAll<HTMLButtonElement>('button')[1]!
    act(() => {
      disabledTrigger.click()
    })

    expect(disabledTrigger.disabled).toBe(true)
    expect(disabledTrigger.getAttribute('aria-expanded')).toBe('false')
  })
})

describe('Accordion keyboard navigation', () => {
  it('Enter and Space toggle the focused trigger', () => {
    renderAccordion()

    const trigger = document.querySelectorAll<HTMLButtonElement>('button')[0]!
    const region = document.querySelectorAll<HTMLElement>('[role="region"]')[0]!
    trigger.focus()

    act(() => {
      pressKey('Enter', trigger)
    })
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(region.getAttribute('aria-hidden')).toBe('false')

    act(() => {
      pressKey(' ', trigger)
    })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(region.getAttribute('aria-hidden')).toBe('true')
  })

  it('ArrowUp ArrowDown Home and End move focus among enabled triggers', () => {
    renderAccordion()

    const triggers = document.querySelectorAll<HTMLButtonElement>('button')
    triggers[0]!.focus()

    pressKey('ArrowDown')
    expect(document.activeElement).toBe(triggers[2])

    pressKey('ArrowDown')
    expect(document.activeElement).toBe(triggers[0])

    pressKey('End')
    expect(document.activeElement).toBe(triggers[2])

    pressKey('Home')
    expect(document.activeElement).toBe(triggers[0])

    pressKey('ArrowUp')
    expect(document.activeElement).toBe(triggers[2])
  })

  it('does not intercept arrow keys from focus inside expanded content', () => {
    renderAccordionWithFocusedContent()

    const input = document.querySelector<HTMLInputElement>(
      'input[aria-label="Filter billing settings"]'
    )!
    input.focus()

    act(() => {
      pressKey('ArrowDown', input)
      pressKey('Home', input)
      pressKey('End', input)
    })

    expect(document.activeElement).toBe(input)
  })

  it('uses roving tabindex for enabled triggers', () => {
    renderAccordion()

    const triggers = document.querySelectorAll<HTMLButtonElement>('button')

    expect(triggers[0]!.tabIndex).toBe(0)
    expect(triggers[1]!.tabIndex).toBe(-1)
    expect(triggers[2]!.tabIndex).toBe(-1)

    act(() => {
      triggers[0]!.focus()
      pressKey('ArrowDown')
    })

    expect(triggers[0]!.tabIndex).toBe(-1)
    expect(triggers[2]!.tabIndex).toBe(0)
  })
})

describe('Accordion focus containment', () => {
  it('suppresses focusable descendants while a panel is closed', () => {
    render(
      <Accordion defaultValue={null}>
        <Accordion.Item value="billing">
          <Accordion.Trigger>Billing</Accordion.Trigger>
          <Accordion.Content>
            <a href="/billing">Billing link</a>
            <input aria-label="Billing filter" tabIndex={2} />
          </Accordion.Content>
        </Accordion.Item>
      </Accordion>
    )

    const trigger = document.querySelector<HTMLButtonElement>('button')!
    const region = document.querySelector<HTMLElement>('[role="region"]')!
    const link = document.querySelector<HTMLAnchorElement>('a')!
    const input = document.querySelector<HTMLInputElement>('input')!

    expect(region.getAttribute('aria-hidden')).toBe('true')
    expect(region.hasAttribute('inert')).toBe(true)
    expect(link.tabIndex).toBe(-1)
    expect(input.tabIndex).toBe(-1)

    act(() => {
      trigger.click()
    })

    expect(region.getAttribute('aria-hidden')).toBe('false')
    expect(region.hasAttribute('inert')).toBe(false)
    expect(link.getAttribute('tabindex')).toBe(null)
    expect(input.getAttribute('tabindex')).toBe('2')
  })
})

describe('Accordion ARIA attributes', () => {
  it('links triggers and regions', () => {
    renderAccordion()

    const triggers = document.querySelectorAll<HTMLButtonElement>('button')
    const regions = document.querySelectorAll<HTMLElement>('[role="region"]')

    expect(triggers[0]!.getAttribute('aria-controls')).toBe(regions[0]!.id)
    expect(regions[0]!.getAttribute('aria-labelledby')).toBe(triggers[0]!.id)
  })

  it('uses value-independent IDs when values contain whitespace', () => {
    render(
      <Accordion defaultValue="advanced settings">
        <Accordion.Item value="advanced settings">
          <Accordion.Trigger>Advanced settings</Accordion.Trigger>
          <Accordion.Content>Advanced settings content</Accordion.Content>
        </Accordion.Item>
      </Accordion>
    )

    const trigger = document.querySelector<HTMLButtonElement>('button')!
    const region = document.querySelector<HTMLElement>('[role="region"]')!

    expect(trigger.id).not.toMatch(/\s/)
    expect(region.id).not.toMatch(/\s/)
    expect(trigger.getAttribute('aria-controls')).toBe(region.id)
    expect(region.getAttribute('aria-labelledby')).toBe(trigger.id)
  })
})
