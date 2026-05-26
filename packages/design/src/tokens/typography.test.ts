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
})
