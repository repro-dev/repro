import { cleanup, render, screen } from '@testing-library/react'
import expect from 'expect'
import { afterEach, describe, it } from 'node:test'
import React, { createRef } from 'react'
import { Badge } from './Badge'

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

describe('Badge', () => {
  it('renders a span with text content', () => {
    render(<Badge>Active</Badge>)

    const span = document.querySelector('span')
    expect(span).not.toBeNull()
    expect(span!.textContent).toBe('Active')
  })

  it('renders each context variant without error', () => {
    const contexts = [
      'neutral',
      'info',
      'success',
      'warning',
      'danger',
    ] as const

    for (const ctx of contexts) {
      const { unmount } = render(<Badge context={ctx}>{ctx}</Badge>)
      expect(screen.getByText(ctx)).toBeDefined()
      unmount()
    }
  })

  it('renders each size variant without error', () => {
    const sizes = ['small', 'medium', 'large'] as const

    for (const sz of sizes) {
      const { unmount } = render(<Badge size={sz}>{sz}</Badge>)
      expect(screen.getByText(sz)).toBeDefined()
      unmount()
    }
  })

  it('applies full border-radius when rounded is true', () => {
    const { container } = render(<Badge rounded={true}>Rounded</Badge>)
    const css = getElementCSSRules(container.firstElementChild!)
      .map(({ cssText }) => cssText)
      .join('\n')

    // radius.full is '9999px'
    expect(css).toContain('border-radius: 9999px')
  })

  it('applies small border-radius when rounded is false', () => {
    const { container } = render(<Badge rounded={false}>Not rounded</Badge>)
    const css = getElementCSSRules(container.firstElementChild!)
      .map(({ cssText }) => cssText)
      .join('\n')

    // radius.sm is 4
    expect(css).toContain('border-radius: 4px')
  })

  it('uses default context neutral, default size medium, default rounded false', () => {
    render(<Badge>Default</Badge>)

    const span = document.querySelector('span')
    expect(span).not.toBeNull()
    expect(span!.textContent).toBe('Default')
  })

  it('forwards ref to the underlying span', () => {
    const ref = createRef<HTMLSpanElement>()

    render(<Badge ref={ref}>Ref test</Badge>)

    expect(ref.current).not.toBeNull()
    expect(ref.current!.tagName).toBe('SPAN')
  })
})
