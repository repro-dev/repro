import { cleanup, render } from '@testing-library/react'
import expect from 'expect'
import { afterEach, describe, it } from 'node:test'
import React from 'react'
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
