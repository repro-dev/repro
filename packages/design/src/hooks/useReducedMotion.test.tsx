import { cleanup, render } from '@testing-library/react'
import expect from 'expect'
import { afterEach, describe, it, mock } from 'node:test'
import React from 'react'
import { useReducedMotion } from './useReducedMotion'

afterEach(() => {
  cleanup()
  mock.reset()
})

function TestComponent(): React.ReactElement | null {
  const prefersReducedMotion = useReducedMotion()
  return <div data-testid="result">{String(prefersReducedMotion)}</div>
}

describe('useReducedMotion', () => {
  it('returns false by default when matchMedia is not available (SSR-safe)', () => {
    // Ensure window.matchMedia is undefined
    const originalMatchMedia = window.matchMedia
    ;(window as any).matchMedia = undefined as any

    render(<TestComponent />)
    const el = document.querySelector('[data-testid="result"]')
    expect(el?.textContent).toBe('false')

    // Restore
    ;(window as any).matchMedia = originalMatchMedia
  })

  it('returns false when prefers-reduced-motion: reduce is NOT set', () => {
    const originalMatchMedia = window.matchMedia
    ;(window as any).matchMedia = (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })

    render(<TestComponent />)
    const el = document.querySelector('[data-testid="result"]')
    expect(el?.textContent).toBe('false')
    ;(window as any).matchMedia = originalMatchMedia
  })

  it('returns true when prefers-reduced-motion: reduce IS set', () => {
    const originalMatchMedia = window.matchMedia
    ;(window as any).matchMedia = (query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })

    render(<TestComponent />)
    const el = document.querySelector('[data-testid="result"]')
    expect(el?.textContent).toBe('true')
    ;(window as any).matchMedia = originalMatchMedia
  })
})
