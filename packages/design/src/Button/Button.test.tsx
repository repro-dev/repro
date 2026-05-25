import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

type ElementCSSRule = {
  selectorText: string
  cssText: string
}

/**
 * Returns only the injected CSS rules whose selectors reference the element's
 * generated jsxstyle classes.
 */
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
    const cssRules = getElementCSSRules(getByRole('button'))

    expect(
      cssRules.some(({ cssText }) => cssText.includes('display: inline-flex'))
    ).toBe(true)
  })

  it('fullWidth Button has display: flex', () => {
    const { getByRole } = render(<Button fullWidth>Text</Button>)
    const cssRules = getElementCSSRules(getByRole('button'))

    // fullWidth restores block-level flex layout
    expect(
      cssRules.some(({ cssText }) => cssText.includes('display: flex'))
    ).toBe(true)
  })

  it('fullWidth Button has width: 100%', () => {
    const { getByRole } = render(<Button fullWidth>Text</Button>)
    const cssRules = getElementCSSRules(getByRole('button'))

    expect(
      cssRules.some(({ cssText }) => cssText.includes('width: 100%'))
    ).toBe(true)
  })

  it('active press uses the standard pressed scale on the button active rule', () => {
    const { getByRole } = render(<Button>Text</Button>)
    const cssRules = getElementCSSRules(getByRole('button'))
    const activeRule = cssRules.find(({ selectorText }) =>
      selectorText.includes(':active:not(:disabled)')
    )

    expect(activeRule).toBeDefined()
    expect(activeRule?.cssText).toContain('scale(0.96)')
  })

  it('forwards HTML props through the supported props bag', () => {
    render(
      <Button props={{ 'aria-haspopup': 'menu', 'aria-expanded': true }}>
        Text
      </Button>
    )

    const button = screen.getByRole('button', { name: 'Text' })
    expect(button.getAttribute('aria-haspopup')).toBe('menu')
    expect(button.getAttribute('aria-expanded')).toBe('true')
  })

  it('calls event handlers passed through the supported props bag', async () => {
    const user = userEvent.setup()
    let clicked = false

    render(
      <Button
        props={{
          onClick: () => {
            clicked = true
          },
        }}
      >
        Text
      </Button>
    )

    await user.click(screen.getByRole('button', { name: 'Text' }))
    expect(clicked).toBe(true)
  })
})
