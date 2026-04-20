import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import expect from 'expect'
import { afterEach, describe, it } from 'node:test'
import React, { useState } from 'react'
import { Accordion } from './index'

afterEach(cleanup)

function pressKey(key: string, target?: Element) {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
  })
  ;(target ?? document.activeElement ?? document).dispatchEvent(event)
  return event
}

describe('Accordion', () => {
  it('opens one item at a time in single-expand mode', async () => {
    const user = userEvent.setup()

    render(
      <Accordion defaultValue="first">
        <Accordion.Item value="first">
          <Accordion.Trigger>First</Accordion.Trigger>
          <Accordion.Content>First content</Accordion.Content>
        </Accordion.Item>
        <Accordion.Item value="second">
          <Accordion.Trigger>Second</Accordion.Trigger>
          <Accordion.Content>Second content</Accordion.Content>
        </Accordion.Item>
      </Accordion>
    )

    const first = screen.getByRole('button', { name: 'First' })
    const second = screen.getByRole('button', { name: 'Second' })

    expect(first.getAttribute('aria-expanded')).toBe('true')
    expect(second.getAttribute('aria-expanded')).toBe('false')

    await user.click(second)

    expect(first.getAttribute('aria-expanded')).toBe('false')
    expect(second.getAttribute('aria-expanded')).toBe('true')
  })

  it('keeps multiple items open in multi-expand mode', async () => {
    const user = userEvent.setup()

    render(
      <Accordion multiple defaultValue={['first']}>
        <Accordion.Item value="first">
          <Accordion.Trigger>First</Accordion.Trigger>
          <Accordion.Content>First content</Accordion.Content>
        </Accordion.Item>
        <Accordion.Item value="second">
          <Accordion.Trigger>Second</Accordion.Trigger>
          <Accordion.Content>Second content</Accordion.Content>
        </Accordion.Item>
      </Accordion>
    )

    const first = screen.getByRole('button', { name: 'First' })
    const second = screen.getByRole('button', { name: 'Second' })

    await user.click(second)

    expect(first.getAttribute('aria-expanded')).toBe('true')
    expect(second.getAttribute('aria-expanded')).toBe('true')
  })

  it('supports controlled multi-expand state', async () => {
    const user = userEvent.setup()

    function Wrapper() {
      const [value, setValue] = useState(['first'])
      return (
        <Accordion multiple value={value} onValueChange={setValue}>
          <Accordion.Item value="first">
            <Accordion.Trigger>First</Accordion.Trigger>
            <Accordion.Content>First content</Accordion.Content>
          </Accordion.Item>
          <Accordion.Item value="second">
            <Accordion.Trigger>Second</Accordion.Trigger>
            <Accordion.Content>Second content</Accordion.Content>
          </Accordion.Item>
        </Accordion>
      )
    }

    render(<Wrapper />)

    const second = screen.getByRole('button', { name: 'Second' })
    await user.click(second)

    expect(second.getAttribute('aria-expanded')).toBe('true')
  })

  it('moves focus with keyboard navigation without changing expansion', () => {
    render(
      <Accordion defaultValue="first">
        <Accordion.Item value="first">
          <Accordion.Trigger>First</Accordion.Trigger>
          <Accordion.Content>First content</Accordion.Content>
        </Accordion.Item>
        <Accordion.Item value="second">
          <Accordion.Trigger>Second</Accordion.Trigger>
          <Accordion.Content>Second content</Accordion.Content>
        </Accordion.Item>
        <Accordion.Item value="third">
          <Accordion.Trigger>Third</Accordion.Trigger>
          <Accordion.Content>Third content</Accordion.Content>
        </Accordion.Item>
      </Accordion>
    )

    const first = screen.getByRole('button', { name: 'First' })
    const second = screen.getByRole('button', { name: 'Second' })

    first.focus()
    pressKey('ArrowDown')

    expect(document.activeElement).toBe(second)
    expect(first.getAttribute('aria-expanded')).toBe('true')
    expect(second.getAttribute('aria-expanded')).toBe('false')

    pressKey('Home')
    expect(document.activeElement).toBe(first)

    pressKey('End')
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Third' })
    )
  })

  it('links each trigger to its content region', () => {
    render(
      <Accordion defaultValue="first">
        <Accordion.Item value="first">
          <Accordion.Trigger>First</Accordion.Trigger>
          <Accordion.Content>First content</Accordion.Content>
        </Accordion.Item>
      </Accordion>
    )

    const trigger = screen.getByRole('button', { name: 'First' })
    const content = screen.getByRole('region', { name: 'First' })

    expect(trigger.getAttribute('aria-controls')).toBe(content.id)
    expect(content.getAttribute('aria-labelledby')).toBe(trigger.id)
  })

  it('renders item headings for screen reader structure', () => {
    render(
      <Accordion defaultValue="first">
        <Accordion.Item value="first">
          <Accordion.Trigger>First</Accordion.Trigger>
          <Accordion.Content>First content</Accordion.Content>
        </Accordion.Item>
        <Accordion.Item value="second">
          <Accordion.Trigger>Second</Accordion.Trigger>
          <Accordion.Content>Second content</Accordion.Content>
        </Accordion.Item>
      </Accordion>
    )

    expect(screen.getAllByRole('heading', { level: 3 }).length).toBe(2)
  })
})
