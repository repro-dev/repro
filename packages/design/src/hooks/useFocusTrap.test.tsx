import expect from 'expect'
import { afterEach, before, describe, it } from 'node:test'
import React from 'react'
import { act } from 'react'
import { createRoot, Root } from 'react-dom/client'
import { useFocusTrap } from './useFocusTrap'

// ---------------------------------------------------------------------------
// Enable React act() environment
// ---------------------------------------------------------------------------

before(() => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let root: Root | null = null
let container: HTMLDivElement | null = null

function setUp() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
}

async function tearDown() {
  if (root) {
    await act(() => {
      root!.unmount()
    })
    root = null
  }
  if (container) {
    document.body.removeChild(container)
    container = null
  }
  // Reset focus to body
  ;(document.activeElement as HTMLElement | null)?.blur?.()
}

async function render(element: React.ReactNode) {
  if (!root || !container) {
    setUp()
  }
  await act(async () => {
    root!.render(element)
  })
}

function pressTab(shiftKey = false) {
  const event = new KeyboardEvent('keydown', {
    key: 'Tab',
    shiftKey,
    bubbles: true,
    cancelable: true,
  })
  document.dispatchEvent(event)
  return event
}

/**
 * Wrapper component that attaches the useFocusTrap ref to a div
 * and renders children inside it.
 */
function TrapContainer({
  active,
  children,
}: {
  active: boolean
  children?: React.ReactNode
}) {
  const ref = useFocusTrap<HTMLDivElement>(active)

  // Imperatively assign the ref since we can't use JSX ref={} with
  // the object returned from useRef in this test harness pattern.
  const divRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(ref as any).current = node
    },
    [ref]
  )

  return React.createElement('div', { ref: divRef, 'data-testid': 'trap' }, children)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useFocusTrap', () => {
  afterEach(tearDown)

  it('moves focus to the first focusable child when activated', async () => {
    setUp()

    // Place a button outside the trap to hold initial focus
    const outer = document.createElement('button')
    outer.textContent = 'outside'
    document.body.appendChild(outer)
    outer.focus()
    expect(document.activeElement).toBe(outer)

    await render(
      React.createElement(
        TrapContainer,
        { active: true },
        React.createElement('button', { id: 'first' }, 'First'),
        React.createElement('button', { id: 'second' }, 'Second')
      )
    )

    expect(document.activeElement?.id).toBe('first')

    document.body.removeChild(outer)
  })

  it('focuses the container itself when there are no focusable children', async () => {
    setUp()

    await render(
      React.createElement(
        TrapContainer,
        { active: true },
        React.createElement('span', null, 'Not focusable')
      )
    )

    const trap = document.querySelector('[data-testid="trap"]')
    expect(document.activeElement).toBe(trap)
    expect((trap as HTMLElement).tabIndex).toBe(-1)
  })

  it('wraps focus from last to first on Tab', async () => {
    setUp()

    await render(
      React.createElement(
        TrapContainer,
        { active: true },
        React.createElement('button', { id: 'a' }, 'A'),
        React.createElement('button', { id: 'b' }, 'B'),
        React.createElement('button', { id: 'c' }, 'C')
      )
    )

    // Focus should be on 'a'. Move to 'c' manually.
    const c = document.getElementById('c')!
    c.focus()
    expect(document.activeElement?.id).toBe('c')

    const event = pressTab()

    expect(document.activeElement?.id).toBe('a')
    expect(event.defaultPrevented).toBe(true)
  })

  it('wraps focus from first to last on Shift+Tab', async () => {
    setUp()

    await render(
      React.createElement(
        TrapContainer,
        { active: true },
        React.createElement('button', { id: 'a' }, 'A'),
        React.createElement('button', { id: 'b' }, 'B'),
        React.createElement('button', { id: 'c' }, 'C')
      )
    )

    // Focus should already be on 'a'
    expect(document.activeElement?.id).toBe('a')

    const event = pressTab(true)

    expect(document.activeElement?.id).toBe('c')
    expect(event.defaultPrevented).toBe(true)
  })

  it('excludes elements inside aria-hidden from the focus cycle', async () => {
    setUp()

    await render(
      React.createElement(
        TrapContainer,
        { active: true },
        React.createElement('button', { id: 'visible' }, 'Visible'),
        React.createElement(
          'div',
          { 'aria-hidden': 'true' },
          React.createElement('button', { id: 'hidden' }, 'Hidden')
        )
      )
    )

    // Focus should be on 'visible' (the only non-hidden focusable)
    expect(document.activeElement?.id).toBe('visible')

    // Tab should wrap back to 'visible' since it's the only focusable
    const event = pressTab()
    expect(document.activeElement?.id).toBe('visible')
    expect(event.defaultPrevented).toBe(true)
  })

  it('prevents Tab when there are no focusable elements', async () => {
    setUp()

    await render(
      React.createElement(
        TrapContainer,
        { active: true },
        React.createElement('span', null, 'Nothing focusable')
      )
    )

    const event = pressTab()
    expect(event.defaultPrevented).toBe(true)
  })

  it('restores focus when deactivated', async () => {
    setUp()

    const outer = document.createElement('button')
    outer.id = 'outer'
    document.body.appendChild(outer)
    outer.focus()

    // Render with active=true
    function Wrapper({ active }: { active: boolean }) {
      return React.createElement(
        TrapContainer,
        { active },
        React.createElement('button', { id: 'inner' }, 'Inner')
      )
    }

    await render(React.createElement(Wrapper, { active: true }))
    expect(document.activeElement?.id).toBe('inner')

    // Deactivate the trap
    await render(React.createElement(Wrapper, { active: false }))

    expect(document.activeElement?.id).toBe('outer')

    document.body.removeChild(outer)
  })

  it('restores focus when unmounted while still active', async () => {
    setUp()

    const outer = document.createElement('button')
    outer.id = 'outer'
    document.body.appendChild(outer)
    outer.focus()

    // Component that conditionally renders the trap
    function Wrapper({ show }: { show: boolean }) {
      if (!show) return null
      return React.createElement(
        TrapContainer,
        { active: true },
        React.createElement('button', { id: 'inner' }, 'Inner')
      )
    }

    await render(React.createElement(Wrapper, { show: true }))
    expect(document.activeElement?.id).toBe('inner')

    // Unmount the trap while still active
    await render(React.createElement(Wrapper, { show: false }))

    expect(document.activeElement?.id).toBe('outer')

    document.body.removeChild(outer)
  })

  it('does not trap focus when inactive', async () => {
    setUp()

    await render(
      React.createElement(
        TrapContainer,
        { active: false },
        React.createElement('button', { id: 'a' }, 'A'),
        React.createElement('button', { id: 'b' }, 'B')
      )
    )

    // Focus should NOT have moved into the container
    expect(document.activeElement?.id).not.toBe('a')

    // Tab should not be intercepted
    const b = document.getElementById('b')!
    b.focus()
    const event = pressTab()
    // The keydown handler should not be registered, so default is not prevented
    expect(event.defaultPrevented).toBe(false)
  })
})
