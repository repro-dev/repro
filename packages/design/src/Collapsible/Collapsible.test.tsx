import { cleanup, render } from '@testing-library/react'
import expect from 'expect'
import { afterEach, describe, it } from 'node:test'
import React, { act } from 'react'
import { Collapsible } from './index'

afterEach(cleanup)

describe('Collapsible', () => {
  it('toggles open and closed in uncontrolled mode', () => {
    render(
      <Collapsible trigger="Advanced settings">Hidden settings</Collapsible>
    )

    const trigger = document.querySelector<HTMLButtonElement>('button')!
    const region = document.querySelector<HTMLElement>('[role="region"]')!

    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(region.getAttribute('aria-hidden')).toBe('true')

    act(() => {
      trigger.click()
    })

    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(region.getAttribute('aria-hidden')).toBe('false')

    act(() => {
      trigger.click()
    })

    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(region.getAttribute('aria-hidden')).toBe('true')
  })

  it('calls onOpenChange in controlled mode without mutating itself', () => {
    let requestedOpen: boolean | undefined

    render(
      <Collapsible
        open={false}
        onOpenChange={nextOpen => {
          requestedOpen = nextOpen
        }}
        trigger="Filters"
      >
        Filter controls
      </Collapsible>
    )

    const trigger = document.querySelector<HTMLButtonElement>('button')!

    act(() => {
      trigger.click()
    })

    expect(requestedOpen).toBe(true)
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })

  it('does not toggle when disabled', () => {
    let called = false

    render(
      <Collapsible
        disabled
        onOpenChange={() => {
          called = true
        }}
        trigger="Disabled disclosure"
      >
        Disabled content
      </Collapsible>
    )

    const trigger = document.querySelector<HTMLButtonElement>('button')!
    act(() => {
      trigger.click()
    })

    expect(called).toBe(false)
    expect(trigger.disabled).toBe(true)
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })

  it('links trigger and region with ARIA attributes', () => {
    render(<Collapsible trigger="Details">Detail content</Collapsible>)

    const trigger = document.querySelector<HTMLButtonElement>('button')!
    const region = document.querySelector<HTMLElement>('[role="region"]')!

    expect(trigger.getAttribute('aria-controls')).toBe(region.id)
    expect(region.getAttribute('aria-labelledby')).toBe(trigger.id)
  })

  it('suppresses focusable descendants while closed', () => {
    render(
      <Collapsible trigger="Advanced settings">
        <a href="/advanced">Advanced link</a>
        <div tabIndex={0}>Custom focus target</div>
        <input aria-label="Advanced filter" tabIndex={3} />
      </Collapsible>
    )

    const trigger = document.querySelector<HTMLButtonElement>('button')!
    const region = document.querySelector<HTMLElement>('[role="region"]')!
    const link = document.querySelector<HTMLAnchorElement>('a')!
    const customFocusTarget =
      document.querySelector<HTMLDivElement>('div[tabindex]')!
    const input = document.querySelector<HTMLInputElement>('input')!

    expect(region.getAttribute('aria-hidden')).toBe('true')
    expect(region.hasAttribute('inert')).toBe(true)
    expect(link.tabIndex).toBe(-1)
    expect(customFocusTarget.tabIndex).toBe(-1)
    expect(input.tabIndex).toBe(-1)

    act(() => {
      trigger.click()
    })

    expect(region.getAttribute('aria-hidden')).toBe('false')
    expect(region.hasAttribute('inert')).toBe(false)
    expect(link.getAttribute('tabindex')).toBe(null)
    expect(customFocusTarget.getAttribute('tabindex')).toBe('0')
    expect(input.getAttribute('tabindex')).toBe('3')
  })
})
