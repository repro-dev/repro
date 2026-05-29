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
})

describe('Accordion ARIA attributes', () => {
  it('links triggers and regions', () => {
    renderAccordion()

    const triggers = document.querySelectorAll<HTMLButtonElement>('button')
    const regions = document.querySelectorAll<HTMLElement>('[role="region"]')

    expect(triggers[0]!.getAttribute('aria-controls')).toBe(regions[0]!.id)
    expect(regions[0]!.getAttribute('aria-labelledby')).toBe(triggers[0]!.id)
  })
})
