import { cleanup, render } from '@testing-library/react'
import expect from 'expect'
import { afterEach, describe, it } from 'node:test'
import React from 'react'
import { color } from '../tokens/colors'
import { Card } from './Card'

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

describe('Card', () => {
  it('keeps the neutral surface and adds a danger border treatment when requested', () => {
    const neutral = render(<Card>Neutral card</Card>)
    const danger = render(<Card context="danger">Danger card</Card>)

    const neutralCSS = getElementCSSRules(neutral.container.firstElementChild!)
      .map(({ cssText }) => cssText)
      .join('\n')
    const dangerCSS = getElementCSSRules(danger.container.firstElementChild!)
      .map(({ cssText }) => cssText)
      .join('\n')

    expect(neutralCSS).toContain('box-shadow')
    expect(neutralCSS).not.toContain(color.dangerBorder)
    expect(dangerCSS).toContain('box-shadow')
    expect(dangerCSS).toContain(color.dangerBorder)
  })
})
