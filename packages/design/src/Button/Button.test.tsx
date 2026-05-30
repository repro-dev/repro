import { getCSSText, getElementCSSRules } from '@repro/testing-utils'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import expect from 'expect'
import { afterEach, describe, it } from 'node:test'
import React from 'react'
import { formControlHeight } from '../tokens/formControl'
import { Button } from './Button'

afterEach(cleanup)

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

describe('Button font-family override — REP-1317', () => {
  it('renders with font-family: inherit to adopt the design system font stack', () => {
    const { getByRole } = render(<Button>Text</Button>)
    const cssRules = getElementCSSRules(getByRole('button'))

    expect(
      cssRules.some(({ cssText }) => cssText.includes('font-family: inherit'))
    ).toBe(true)
  })
})
