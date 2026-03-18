import { cleanup, render } from '@testing-library/react'
import expect from 'expect'
import { afterEach, describe, it } from 'node:test'
import React, { useCallback } from 'react'
import { useFocusTrap } from './useFocusTrap'

afterEach(cleanup)

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

function TrapContainer({
  active,
  children,
}: {
  active: boolean
  children?: React.ReactNode
}) {
  const ref = useFocusTrap<HTMLDivElement>(active)

  const divRef = useCallback(
    (node: HTMLDivElement | null) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(ref as any).current = node
    },
    [ref]
  )

  return (
    <div ref={divRef} data-testid="trap">
      {children}
    </div>
  )
}

describe('useFocusTrap', () => {
  it('moves focus to the first focusable child when activated', () => {
    const outer = document.createElement('button')
    outer.textContent = 'outside'
    document.body.appendChild(outer)
    outer.focus()
    expect(document.activeElement).toBe(outer)

    render(
      <TrapContainer active={true}>
        <button id="first">First</button>
        <button id="second">Second</button>
      </TrapContainer>
    )

    expect(document.activeElement?.id).toBe('first')

    document.body.removeChild(outer)
  })

  it('focuses the container itself when there are no focusable children', () => {
    render(
      <TrapContainer active={true}>
        <span>Not focusable</span>
      </TrapContainer>
    )

    const trap = document.querySelector('[data-testid="trap"]')
    expect(document.activeElement).toBe(trap)
    expect((trap as HTMLElement).tabIndex).toBe(-1)
  })

  it('wraps focus from last to first on Tab', () => {
    render(
      <TrapContainer active={true}>
        <button id="a">A</button>
        <button id="b">B</button>
        <button id="c">C</button>
      </TrapContainer>
    )

    const c = document.getElementById('c')!
    c.focus()
    expect(document.activeElement?.id).toBe('c')

    const event = pressTab()

    expect(document.activeElement?.id).toBe('a')
    expect(event.defaultPrevented).toBe(true)
  })

  it('wraps focus from first to last on Shift+Tab', () => {
    render(
      <TrapContainer active={true}>
        <button id="a">A</button>
        <button id="b">B</button>
        <button id="c">C</button>
      </TrapContainer>
    )

    expect(document.activeElement?.id).toBe('a')

    const event = pressTab(true)

    expect(document.activeElement?.id).toBe('c')
    expect(event.defaultPrevented).toBe(true)
  })

  it('excludes elements inside aria-hidden from the focus cycle', () => {
    render(
      <TrapContainer active={true}>
        <button id="visible">Visible</button>
        <div aria-hidden="true">
          <button id="hidden">Hidden</button>
        </div>
      </TrapContainer>
    )

    expect(document.activeElement?.id).toBe('visible')

    const event = pressTab()
    expect(document.activeElement?.id).toBe('visible')
    expect(event.defaultPrevented).toBe(true)
  })

  it('prevents Tab when there are no focusable elements', () => {
    render(
      <TrapContainer active={true}>
        <span>Nothing focusable</span>
      </TrapContainer>
    )

    const event = pressTab()
    expect(event.defaultPrevented).toBe(true)
  })

  it('restores focus when deactivated', () => {
    const outer = document.createElement('button')
    outer.id = 'outer'
    document.body.appendChild(outer)
    outer.focus()

    function Wrapper({ active }: { active: boolean }) {
      return (
        <TrapContainer active={active}>
          <button id="inner">Inner</button>
        </TrapContainer>
      )
    }

    const { rerender } = render(<Wrapper active={true} />)
    expect(document.activeElement?.id).toBe('inner')

    rerender(<Wrapper active={false} />)

    expect(document.activeElement?.id).toBe('outer')

    document.body.removeChild(outer)
  })

  it('restores focus when unmounted while still active', () => {
    const outer = document.createElement('button')
    outer.id = 'outer'
    document.body.appendChild(outer)
    outer.focus()

    function Wrapper({ show }: { show: boolean }) {
      if (!show) return null
      return (
        <TrapContainer active={true}>
          <button id="inner">Inner</button>
        </TrapContainer>
      )
    }

    const { rerender } = render(<Wrapper show={true} />)
    expect(document.activeElement?.id).toBe('inner')

    rerender(<Wrapper show={false} />)

    expect(document.activeElement?.id).toBe('outer')

    document.body.removeChild(outer)
  })

  it('does not trap focus when inactive', () => {
    render(
      <TrapContainer active={false}>
        <button id="a">A</button>
        <button id="b">B</button>
      </TrapContainer>
    )

    expect(document.activeElement?.id).not.toBe('a')

    const b = document.getElementById('b')!
    b.focus()
    const event = pressTab()
    expect(event.defaultPrevented).toBe(false)
  })
})
