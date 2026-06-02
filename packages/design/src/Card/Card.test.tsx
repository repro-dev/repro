import { getElementCSSRules } from '@repro/testing-utils'
import { cleanup, render, screen } from '@testing-library/react'
import expect from 'expect'
import { afterEach, describe, it } from 'node:test'
import React from 'react'
import { color } from '../tokens/colors'
import { shadow } from '../tokens/elevation'
import { spacing } from '../tokens/spacing'
import { Card } from './Card'

afterEach(cleanup)

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

    // Default shadow is none (flat) — existing consumers are expected to
    // opt into elevation with the explicit `shadow` prop
    expect(neutralCSS).toContain(`box-shadow: ${shadow.none}`)
    expect(neutralCSS).not.toContain(color.dangerBorder)
    expect(dangerCSS).toContain(`box-shadow: ${shadow.none}`)
    expect(dangerCSS).toContain(color.dangerBorder)
  })

  it('renders children inside the card', () => {
    render(
      <Card>
        <span data-testid="child">Child content</span>
      </Card>
    )

    expect(screen.getByTestId('child').textContent).toBe('Child content')
  })

  it('renders with default padding when fullBleed is not set', () => {
    const { container } = render(<Card>With padding</Card>)
    const css = getElementCSSRules(container.firstElementChild!)
      .map(({ cssText }) => cssText)
      .join('\n')

    // Default padding should be spacing['2xl'] (32px)
    expect(css).toContain(`padding: ${spacing['2xl']}px`)
  })

  it('renders without default padding when fullBleed is set', () => {
    const { container } = render(<Card fullBleed>Full bleed</Card>)
    const css = getElementCSSRules(container.firstElementChild!)
      .map(({ cssText }) => cssText)
      .join('\n')

    // fullBleed sets padding to 0
    expect(css).toContain('padding: 0')
    // fullBleed sets background-color to transparent
    expect(css).toContain('background-color: transparent')
  })

  it('applies custom height prop to the card', () => {
    const { container } = render(<Card height={200}>Tall card</Card>)
    const css = getElementCSSRules(container.firstElementChild!)
      .map(({ cssText }) => cssText)
      .join('\n')

    expect(css).toContain('height: 200px')
  })

  it('applies custom padding prop overriding default padding', () => {
    const { container } = render(<Card padding={4}>Custom pad</Card>)
    const css = getElementCSSRules(container.firstElementChild!)
      .map(({ cssText }) => cssText)
      .join('\n')

    // Custom padding of 4px
    expect(css).toContain('padding: 4px')
  })

  it('defaults to flat surface with no shadow', () => {
    const { container } = render(<Card>Flat card</Card>)
    const css = getElementCSSRules(container.firstElementChild!)
      .map(({ cssText }) => cssText)
      .join('\n')

    expect(css).toContain(`box-shadow: ${shadow.none}`)
  })

  it('applies the specified shadow token', () => {
    const { container } = render(<Card shadow="md">Elevated card</Card>)
    const css = getElementCSSRules(container.firstElementChild!)
      .map(({ cssText }) => cssText)
      .join('\n')

    expect(css).toContain(shadow.md)
  })
})
