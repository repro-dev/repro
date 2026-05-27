import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import expect from 'expect'
import { afterEach, describe, it } from 'node:test'
import React from 'react'
import { FormField } from '../FormField'
import { FormFieldError } from '../FormFieldError'
import { Label } from '../Label'
import { formControlHeight } from '../tokens/formControl'
import { Input } from './Input'

afterEach(cleanup)

/**
 * jsxstyle generates hashed CSS class names and injects rules into a <style>
 * element. Height must be verified by searching the injected CSS rules.
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
        // Match rules like ._abc123 { ... } — check if the selector class is on the element
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

describe('Input height — formControlHeight tokens (REP-659)', () => {
  it('small Input renders a CSS rule with height=28px', () => {
    render(<Input size="small" aria-label="test" />)
    const css = getCSSText()
    expect(css).toContain(`height: ${formControlHeight.small}px`)
  })

  it('medium Input renders a CSS rule with height=36px', () => {
    render(<Input size="medium" aria-label="test" />)
    const css = getCSSText()
    expect(css).toContain(`height: ${formControlHeight.medium}px`)
  })

  it('large Input renders a CSS rule with height=44px', () => {
    render(<Input size="large" aria-label="test" />)
    const css = getCSSText()
    expect(css).toContain(`height: ${formControlHeight.large}px`)
  })

  it('default size (medium) renders a CSS rule with height=36px', () => {
    render(<Input aria-label="test" />)
    const css = getCSSText()
    expect(css).toContain(`height: ${formControlHeight.medium}px`)
  })
})

describe('Input vertical centering — flexbox (REP-659)', () => {
  it('single-line Input wrapper has display:flex and align-items:center', () => {
    const { container } = render(<Input aria-label="test" />)
    // The outermost element is the wrapper Block
    const wrapper = container.firstElementChild as Element
    const css = getElementCSSText(wrapper)
    expect(css).toContain('display: flex')
    expect(css).toContain('align-items: center')
  })

  it('single-line Input inner element has only horizontal padding (no vertical padding shorthand)', () => {
    const { container } = render(<Input size="medium" aria-label="test" />)
    // The inner element is the <input> itself (second child or direct child of wrapper)
    const wrapper = container.firstElementChild as Element
    const innerInput = wrapper.firstElementChild as Element
    const css = getElementCSSText(innerInput)
    // Should have horizontal padding (padding-left / padding-right)
    // but NOT the "padding: Xpx Ypx" shorthand with two values (vertical + horizontal)
    expect(css).not.toMatch(/padding:\s*\d+px \d+px/)
  })

  it('textarea wrapper has no fixed height (no height rule on wrapper)', () => {
    const { container } = render(
      <Input rows={4} size="medium" aria-label="test" />
    )
    const wrapper = container.firstElementChild as Element
    const css = getElementCSSText(wrapper)
    // Textarea wrapper should not have a height rule
    expect(css).not.toMatch(/height:\s*\d+px/)
  })

  it('textarea inner element keeps full symmetric padding', () => {
    const { container } = render(
      <Input rows={4} size="medium" aria-label="test" />
    )
    const wrapper = container.firstElementChild as Element
    const innerTextarea = wrapper.firstElementChild as Element
    const css = getElementCSSText(innerTextarea)
    // textarea should have the "padding: Xpx Ypx" shorthand
    expect(css).toMatch(/padding:\s*\d+px \d+px/)
  })
})

describe('Input trailing actions (REP-1176)', () => {
  it('renders an accessible trailing action after the textbox in tab order', async () => {
    const user = userEvent.setup()
    let clearCount = 0

    render(
      <Input
        aria-label="Search"
        trailingAction={{
          label: 'Clear search',
          icon: <span aria-hidden="true">×</span>,
          onClick: () => {
            clearCount += 1
          },
        }}
      />
    )

    const input = screen.getByRole('textbox', { name: 'Search' })
    const action = screen.getByRole<HTMLButtonElement>('button', {
      name: 'Clear search',
    })

    await user.tab()
    expect(document.activeElement).toBe(input)

    await user.tab()
    expect(document.activeElement).toBe(action)

    await user.click(action)
    expect(clearCount).toBe(1)
  })

  it('preserves FormField wiring and disables related trailing actions', () => {
    render(
      <FormField id="account-name" invalid disabled>
        <Label>Name</Label>
        <Input
          trailingAction={{
            label: 'Cancel name edit',
            icon: <span aria-hidden="true">×</span>,
            onClick: () => undefined,
          }}
        />
        <FormFieldError error={{ message: 'Name is required' }} />
      </FormField>
    )

    const input = screen.getByRole<HTMLInputElement>('textbox', {
      name: 'Name',
    })
    const action = screen.getByRole<HTMLButtonElement>('button', {
      name: 'Cancel name edit',
    })

    expect(input.getAttribute('id')).toBe('account-name')
    expect(input.getAttribute('aria-describedby')).toBe('account-name-error')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(input.disabled).toBe(true)
    expect(action.disabled).toBe(true)
  })
})
