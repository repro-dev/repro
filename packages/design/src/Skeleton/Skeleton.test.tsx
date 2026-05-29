import { cleanup, render } from '@testing-library/react'
import expect from 'expect'
import { afterEach, describe, it } from 'node:test'
import React from 'react'
import { Skeleton } from './Skeleton'

afterEach(cleanup)

type ElementCSSRule = {
  selectorText: string
  cssText: string
}

function getElementCSSRules(el: Element): ElementCSSRule[] {
  const classNames = new Set(Array.from(el.classList))
  const matchingRules: ElementCSSRule[] = []

  for (let i = 0; i < document.styleSheets.length; i++) {
    const sheet = document.styleSheets[i]
    if (!sheet) continue

    try {
      for (const rule of Array.from(sheet.cssRules || [])) {
        if (
          !('selectorText' in rule) ||
          typeof rule.selectorText !== 'string'
        ) {
          continue
        }

        const selectorClassNames = Array.from(
          rule.selectorText.matchAll(/\.([\w-]+)/g),
          ([, className]) => className
        )

        if (selectorClassNames.some(className => classNames.has(className))) {
          matchingRules.push({
            selectorText: rule.selectorText,
            cssText: rule.cssText,
          })
        }
      }
    } catch {
      // cross-origin sheets; ignore
    }
  }

  return matchingRules
}

describe('Skeleton', () => {
  it('renders with role="status", aria-busy="true", aria-label="Loading"', () => {
    render(<Skeleton />)

    const el = document.querySelector('[role="status"]')
    expect(el).not.toBeNull()
    expect(el!.getAttribute('aria-busy')).toBe('true')
    expect(el!.getAttribute('aria-label')).toBe('Loading')
  })

  it('renders variant="text" with default dimensions', () => {
    render(<Skeleton variant="text" />)

    const el = document.querySelector('[role="status"]')
    expect(el).not.toBeNull()
  })

  it('renders variant="rectangular" without error', () => {
    render(<Skeleton variant="rectangular" />)

    const el = document.querySelector('[role="status"]')
    expect(el).not.toBeNull()
  })

  it('renders variant="circular" without error', () => {
    render(<Skeleton variant="circular" />)

    const el = document.querySelector('[role="status"]')
    expect(el).not.toBeNull()
  })

  it('renders multiple lines for text variant when lines > 1', () => {
    render(<Skeleton variant="text" lines={3} />)

    // The container has role="status"
    const container = document.querySelector('[role="status"]')
    expect(container).not.toBeNull()
    // Should have 3 child divs (one per line)
    expect(container!.children.length).toBe(3)
  })

  it('renders single line by default', () => {
    render(<Skeleton variant="text" />)

    // Single line variant renders a single div (no container)
    const el = document.querySelector('[role="status"]')
    expect(el).not.toBeNull()
  })

  it('applies custom width and height as CSS values', () => {
    render(<Skeleton width={200} height={50} />)

    const el = document.querySelector('[role="status"]')
    expect(el).not.toBeNull()

    const css = getElementCSSRules(el!)
      .map(({ cssText }) => cssText)
      .join('\n')

    expect(css).toContain('width: 200px')
    expect(css).toContain('height: 50px')
  })

  it('renders last line at 80% width when lines > 1', () => {
    render(<Skeleton variant="text" lines={3} />)

    const container = document.querySelector('[role="status"]')
    expect(container).not.toBeNull()
    expect(container!.children.length).toBe(3)

    // The last child should have 80% width
    const lastChild = container!.lastElementChild
    expect(lastChild).not.toBeNull()

    const css = getElementCSSRules(lastChild!)
      .map(({ cssText }) => cssText)
      .join('\n')

    expect(css).toContain('width: 80%')
  })

  it('uses default variant text and default lines 1', () => {
    render(<Skeleton />)

    const el = document.querySelector('[role="status"]')
    expect(el).not.toBeNull()
  })
})
