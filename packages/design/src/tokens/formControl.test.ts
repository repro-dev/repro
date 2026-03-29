import expect from 'expect'
import { describe, it } from 'node:test'
import { formControlHeight } from './formControl'

describe('formControlHeight token', () => {
  it('exports small=28, medium=36, large=44', () => {
    expect(formControlHeight.small).toBe(28)
    expect(formControlHeight.medium).toBe(36)
    expect(formControlHeight.large).toBe(44)
  })

  it('has all three size keys', () => {
    const keys = Object.keys(formControlHeight)
    expect(keys).toContain('small')
    expect(keys).toContain('medium')
    expect(keys).toContain('large')
    expect(keys).toHaveLength(3)
  })
})
