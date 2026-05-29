import { getCSSText } from '@repro/testing-utils'
import { cleanup, render } from '@testing-library/react'
import expect from 'expect'
import { afterEach, describe, it } from 'node:test'
import React from 'react'
import { formControlHeight } from '../tokens/formControl'
import { Select } from './Select'

afterEach(cleanup)

const options = [
  { value: 'a', label: 'Option A' },
  { value: 'b', label: 'Option B' },
]

describe('Select height — formControlHeight tokens (REP-659)', () => {
  it('small Select trigger renders a CSS rule with height=28px', () => {
    render(
      <Select
        size="small"
        options={options}
        aria-label="test"
        value=""
        onChange={() => {}}
      />
    )
    const css = getCSSText()
    expect(css).toContain(`height: ${formControlHeight.small}px`)
  })

  it('medium Select trigger renders a CSS rule with height=36px', () => {
    render(
      <Select
        size="medium"
        options={options}
        aria-label="test"
        value=""
        onChange={() => {}}
      />
    )
    const css = getCSSText()
    expect(css).toContain(`height: ${formControlHeight.medium}px`)
  })

  it('large Select trigger renders a CSS rule with height=44px', () => {
    render(
      <Select
        size="large"
        options={options}
        aria-label="test"
        value=""
        onChange={() => {}}
      />
    )
    const css = getCSSText()
    expect(css).toContain(`height: ${formControlHeight.large}px`)
  })

  it('default size (medium) renders a CSS rule with height=36px', () => {
    render(
      <Select
        options={options}
        aria-label="test"
        value=""
        onChange={() => {}}
      />
    )
    const css = getCSSText()
    expect(css).toContain(`height: ${formControlHeight.medium}px`)
  })
})
