import expect from 'expect'
import { describe, it } from 'node:test'
import { fontFamily, fontSize, lineHeight, textStyles } from './typography'

const expectedSansStack =
  "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"

describe('typography font size tokens', () => {
  it('provides the revised font size scale', () => {
    // xs sits at the 12px readability floor (REP-1656): 11px body text failed
    // the tiny-text design rule, so the minimum token converges with sm at 12px.
    expect(fontSize.xs).toBe(12)
    expect(fontSize.sm).toBe(12)
    expect(fontSize.md).toBe(14)
    expect(fontSize.lg).toBe(18)
    expect(fontSize.xl).toBe(20)
    expect(fontSize['2xl']).toBe(24)
    expect(fontSize['3xl']).toBe(32)
  })
})

describe('typography line height tokens', () => {
  it('provides a lineHeight.none token for icon-only alignment', () => {
    expect(lineHeight.none).toBe(0)
  })

  it('provides standard line height tokens', () => {
    expect(lineHeight.tight).toBe(1)
    expect(lineHeight.normal).toBe(1.25)
    expect(lineHeight.relaxed).toBe(1.5)
  })
})

describe('typography font family tokens', () => {
  it('uses the shared product sans stack instead of bare sans-serif', () => {
    expect(fontFamily.sans).toBe(expectedSansStack)
    expect(fontFamily.sans).not.toBe('sans-serif')
  })

  it('applies the product sans stack to sans text styles', () => {
    expect(textStyles.body.fontFamily).toBe(expectedSansStack)
    expect(textStyles.heading1.fontFamily).toBe(expectedSansStack)
    expect(textStyles.caption.fontFamily).toBe(expectedSansStack)
  })

  it('includes heading4/5/6 with the product sans stack', () => {
    expect(textStyles.heading4.fontFamily).toBe(expectedSansStack)
    expect(textStyles.heading5.fontFamily).toBe(expectedSansStack)
    expect(textStyles.heading6.fontFamily).toBe(expectedSansStack)
  })

  it('has heading4/5/6 fontSize non-increasing after heading3, floored at the xs/sm convergence (12px)', () => {
    const h3 = textStyles.heading3.fontSize
    const h4 = textStyles.heading4.fontSize
    const h5 = textStyles.heading5.fontSize
    const h6 = textStyles.heading6.fontSize
    const body = textStyles.body.fontSize

    expect(h4).toBeLessThan(h3)
    expect(h5).toBeLessThan(h4)
    // h5 and h6 both sit at the 12px readability floor pending the type-scale
    // review (REP-1656) — non-strict while the scale is converged.
    expect(h6).toBeLessThanOrEqual(h5)
    expect(h6).toBeLessThanOrEqual(body)
    expect(h6).toBe(fontSize.xs)
  })
})

describe('textStyles presets reflect revised scale', () => {
  it('uses the updated font sizes in common presets', () => {
    expect(textStyles.display.fontSize).toBe(32)
    expect(textStyles.heading1.fontSize).toBe(24)
    expect(textStyles.heading2.fontSize).toBe(20)
    expect(textStyles.heading3.fontSize).toBe(18)
    expect(textStyles.heading4.fontSize).toBe(14)
    expect(textStyles.heading5.fontSize).toBe(12)
    expect(textStyles.heading6.fontSize).toBe(12)
    expect(textStyles.body.fontSize).toBe(14)
    expect(textStyles.bodySmall.fontSize).toBe(12)
    expect(textStyles.caption.fontSize).toBe(12)
    expect(textStyles.label.fontSize).toBe(12)
    expect(textStyles.code.fontSize).toBe(12)
    expect(textStyles.overline.fontSize).toBe(12)
  })
})
