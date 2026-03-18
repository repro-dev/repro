import { cleanup, render } from '@testing-library/react'
import expect from 'expect'
import { afterEach, describe, it } from 'node:test'
import React from 'react'
import { useStableId } from '~/useStableId'

afterEach(cleanup)

function IdDisplay({ prefix }: { prefix?: string }) {
  const id = useStableId(prefix)
  return <span data-testid="id-display">{id}</span>
}

describe('useStableId', () => {
  it('returns a string', () => {
    render(<IdDisplay />)
    const el = document.querySelector('[data-testid="id-display"]')!
    expect(typeof el.textContent).toBe('string')
    expect(el.textContent!.length).toBeGreaterThan(0)
  })

  it('prepends the prefix when provided', () => {
    render(<IdDisplay prefix="tooltip" />)
    const el = document.querySelector('[data-testid="id-display"]')!
    expect(el.textContent!.startsWith('tooltip-')).toBe(true)
  })

  it('does not include a prefix when none is provided', () => {
    render(<IdDisplay />)
    const el = document.querySelector('[data-testid="id-display"]')!
    expect(el.textContent!.startsWith('tooltip')).toBe(false)
  })

  it('returns unique IDs for different component instances', () => {
    render(
      <div>
        <IdDisplay />
        <IdDisplay />
      </div>
    )
    const els = document.querySelectorAll('[data-testid="id-display"]')
    const id1 = els[0]!.textContent
    const id2 = els[1]!.textContent
    expect(id1).not.toBe(id2)
  })

  it('returns a stable ID across re-renders', () => {
    const { rerender } = render(<IdDisplay prefix="test" />)
    const el = document.querySelector('[data-testid="id-display"]')!
    const firstId = el.textContent

    rerender(<IdDisplay prefix="test" />)
    const secondId = document.querySelector(
      '[data-testid="id-display"]'
    )!.textContent

    expect(firstId).toBe(secondId)
  })
})
