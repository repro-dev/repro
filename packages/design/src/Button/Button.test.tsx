import { cleanup, render } from '@testing-library/react'
import expect from 'expect'
import { afterEach, describe, it } from 'node:test'
import React from 'react'
import { formControlHeight } from '../tokens/formControl'
import { Button } from './Button'

afterEach(cleanup)

/**
 * jsxstyle generates hashed CSS class names and injects rules into a <style>
 * element. There are no inline styles to inspect — we must verify height by
 * searching the stylesheet rules for the expected `height: <n>px` declaration.
 */
function getCSSText(): string {
  const rules: string[] = []
  for (let i = 0; i < document.styleSheets.length; i++) {
    const sheet = document.styleSheets[i]
    if (!sheet) continue
    try {
      for (const rule of Array.from(sheet.cssRules || [])) {
        rules.push(rule.cssText)
      }
    } catch {
      // cross-origin sheets; ignore
    }
  }
  return rules.join('\n')
}

/**
 * Returns the CSS rules that apply to the element's own class names, by
 * intersecting the element's classList with the injected stylesheet rules.
 */
function getElementCSSText(el: Element): string {
  const classNames = new Set(Array.from(el.classList))
  const matchingRules: string[] = []
  for (let i = 0; i < document.styleSheets.length; i++) {
    const sheet = document.styleSheets[i]
    if (!sheet) continue
    try {
      for (const rule of Array.from(sheet.cssRules || [])) {
        const cssText = rule.cssText
        const selectorMatch = cssText.match(/^\.([\w-]+)/)
        if (selectorMatch && classNames.has(selectorMatch[1]!)) {
          matchingRules.push(cssText)
        }
      }
    } catch {
      // cross-origin sheets; ignore
    }
  }
  return matchingRules.join('\n')
}

describe('Button height — formControlHeight tokens (REP-659)', () => {
  it('small Button renders a CSS rule with height=28px', () => {
    render(<Button size="small">Click</Button>)
    const css = getCSSText()
    expect(css).toContain(`height: ${formControlHeight.small}px`)
  })

  it('medium Button renders a CSS rule with height=36px', () => {
    render(<Button size="medium">Click</Button>)
    const css = getCSSText()
    expect(css).toContain(`height: ${formControlHeight.medium}px`)
  })

  it('large Button renders a CSS rule with height=44px', () => {
    render(<Button size="large">Click</Button>)
    const css = getCSSText()
    expect(css).toContain(`height: ${formControlHeight.large}px`)
  })

  it('default size (medium) renders a CSS rule with height=36px', () => {
    render(<Button>Click</Button>)
    const css = getCSSText()
    expect(css).toContain(`height: ${formControlHeight.medium}px`)
  })

  it('renders a <button> element', () => {
    render(<Button>Click</Button>)
    const btn = document.querySelector('button')
    expect(btn).not.toBeNull()
  })
})

describe('Button display and width — REP-314', () => {
  it('default Button has display: inline-flex', () => {
    const { getByRole } = render(<Button>Text</Button>)
    const css = getElementCSSText(getByRole('button'))
    expect(css).toContain('display: inline-flex')
  })

  it('fullWidth Button has display: flex', () => {
    const { getByRole } = render(<Button fullWidth>Text</Button>)
    const css = getElementCSSText(getByRole('button'))
    // fullWidth restores block-level flex layout
    expect(css).toContain('display: flex')
  })

  it('fullWidth Button has width: 100%', () => {
    const { getByRole } = render(<Button fullWidth>Text</Button>)
    const css = getElementCSSText(getByRole('button'))
    expect(css).toContain('width: 100%')
  })

  it('active press uses scaleY transform, not uniform scale', () => {
    const { getByRole } = render(<Button>Text</Button>)
    const css = getElementCSSText(getByRole('button'))
    // Must use height-based scaleY — NOT scale(0.96)
    expect(css).toContain('scaleY')
    expect(css).not.toContain('scale(0.96)')
  })
})
