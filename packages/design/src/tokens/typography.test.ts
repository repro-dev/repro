import expect from 'expect'
import { describe, it } from 'node:test'
import { fontFamily, textStyles } from './typography'

const expectedSansStack =
  "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"

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

  it('has heading4/5/6 fontSize in descending order after heading3', () => {
    const h3 = textStyles.heading3.fontSize
    const h4 = textStyles.heading4.fontSize
    const h5 = textStyles.heading5.fontSize
    const h6 = textStyles.heading6.fontSize
    const body = textStyles.body.fontSize

    expect(h4).toBeLessThan(h3)
    expect(h5).toBeLessThan(h4)
    expect(h6).toBeLessThan(h5)
    expect(h6).toBeLessThan(body)
  })
})
