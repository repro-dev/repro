import { Block } from '@jsxstyle/react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import expect from 'expect'
import { afterEach, describe, it } from 'node:test'
import React, { useState } from 'react'
import { Accordion } from './index'

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

  it('marks collapsing panels inert while they animate out', async () => {
    const user = userEvent.setup()

    render(
      <Accordion defaultValue="first">
        <Accordion.Item value="first">
          <Accordion.Trigger>First</Accordion.Trigger>
          <Accordion.Content>
            <button type="button">Inner action</button>
          </Accordion.Content>
        </Accordion.Item>
        <Accordion.Item value="second">
          <Accordion.Trigger>Second</Accordion.Trigger>
          <Accordion.Content>Second content</Accordion.Content>
        </Accordion.Item>
      </Accordion>
    )

    const firstRegion = screen.getByRole('region', { name: 'First' })
    const second = screen.getByRole('button', { name: 'Second' })

    await user.click(second)

    expect(firstRegion.getAttribute('inert')).toBe('')
    expect(screen.getByText('Inner action')).toBeDefined()

    fireEvent.transitionEnd(firstRegion)

    expect(
      screen.queryByRole('region', { name: 'First', hidden: true })
    ).toBeNull()
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

    await user.click(first)

    expect(screen.queryByRole('region', { name: 'First' })).toBeNull()
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

  it('skips focusable buttons inside panel content when roving between triggers', () => {
    render(
      <Accordion defaultValue="first">
        <Accordion.Item value="first">
          <Accordion.Trigger>First</Accordion.Trigger>
          <Accordion.Content>
            <Block component="h3" margin={0}>
              <button type="button">Inner action</button>
            </Block>
          </Accordion.Content>
        </Accordion.Item>
        <Accordion.Item value="second">
          <Accordion.Trigger>Second</Accordion.Trigger>
          <Accordion.Content>Second content</Accordion.Content>
        </Accordion.Item>
      </Accordion>
    )

    const first = screen.getByRole('button', { name: 'First' })
    const innerAction = screen.getByRole('button', { name: 'Inner action' })
    const second = screen.getByRole('button', { name: 'Second' })

    first.focus()
    pressKey('ArrowDown')

    expect(document.activeElement).toBe(second)

    innerAction.focus()
    pressKey('ArrowDown', innerAction)

    expect(document.activeElement).toBe(innerAction)
  })

  it('does not move focus when keyboard navigation starts inside panel content', () => {
    render(
      <Accordion defaultValue="first">
        <Accordion.Item value="first">
          <Accordion.Trigger>First</Accordion.Trigger>
          <Accordion.Content>
            <button type="button">Inner action</button>
          </Accordion.Content>
        </Accordion.Item>
        <Accordion.Item value="second">
          <Accordion.Trigger>Second</Accordion.Trigger>
          <Accordion.Content>Second content</Accordion.Content>
        </Accordion.Item>
      </Accordion>
    )

    const innerAction = screen.getByRole('button', { name: 'Inner action' })
    const first = screen.getByRole('button', { name: 'First' })
    const second = screen.getByRole('button', { name: 'Second' })

    for (const key of ['ArrowDown', 'Home', 'End']) {
      innerAction.focus()
      pressKey(key, innerAction)

      expect(document.activeElement).toBe(innerAction)
      expect(first.getAttribute('aria-expanded')).toBe('true')
      expect(second.getAttribute('aria-expanded')).toBe('false')
    }
  })

  it('keeps ids unique when item values sanitize to the same slug', () => {
    render(
      <Accordion defaultValue="foo bar">
        <Accordion.Item value="foo bar">
          <Accordion.Trigger>Space</Accordion.Trigger>
          <Accordion.Content>Space content</Accordion.Content>
        </Accordion.Item>
        <Accordion.Item value="foo-bar">
          <Accordion.Trigger>Hyphen</Accordion.Trigger>
          <Accordion.Content>Hyphen content</Accordion.Content>
        </Accordion.Item>
      </Accordion>
    )

    const spaceTrigger = screen.getByRole('button', { name: 'Space' })
    const hyphenTrigger = screen.getByRole('button', { name: 'Hyphen' })

    expect(spaceTrigger.id).not.toBe(hyphenTrigger.id)
    expect(spaceTrigger.getAttribute('aria-controls')).not.toBe(
      hyphenTrigger.getAttribute('aria-controls')
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

  it('forwards standard button attributes to triggers', () => {
    render(
      <Accordion defaultValue="first">
        <Accordion.Item value="first">
          <Accordion.Trigger
            aria-label="Toggle first"
            data-testid="first-trigger"
          >
            First
          </Accordion.Trigger>
          <Accordion.Content>First content</Accordion.Content>
        </Accordion.Item>
      </Accordion>
    )

    const trigger = screen.getByTestId('first-trigger')

    expect(trigger.getAttribute('aria-label')).toBe('Toggle first')
    expect(trigger.getAttribute('type')).toBe('button')
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
