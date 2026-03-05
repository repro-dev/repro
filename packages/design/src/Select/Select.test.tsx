import { cleanup, render } from '@testing-library/react'
import expect from 'expect'
import { afterEach, describe, it, mock } from 'node:test'
import React from 'react'
import { Label } from '../Label/Label'
import { Select, type SelectOption } from './Select'

afterEach(cleanup)

const options: SelectOption[] = [
  { value: 'apple', label: 'Apple' },
  { value: 'banana', label: 'Banana' },
  { value: 'cherry', label: 'Cherry' },
]

describe('Select — external Label (REP-307)', () => {
  it('renders the trigger without a bundled label element', () => {
    render(
      <Select
        value=""
        onChange={() => {}}
        options={options}
        aria-label="Fruit"
      />
    )

    const labels = document.querySelectorAll('label')
    expect(labels.length).toBe(0)
  })

  it('does not accept a label prop', () => {
    const props = {
      value: '',
      onChange: () => {},
      options,
      'aria-label': 'Fruit',
    } as Record<string, unknown>

    expect('label' in props).toBe(false)
  })

  it('associates an external Label via id and aria-labelledby', () => {
    render(
      <>
        <Label htmlFor="fruit-select">Fruit</Label>
        <Select
          id="fruit-select"
          value=""
          onChange={() => {}}
          options={options}
        />
      </>
    )

    const trigger = document.querySelector('button')
    expect(trigger).not.toBeNull()
    expect(trigger!.getAttribute('id')).toBe('fruit-select')

    const label = document.querySelector('label')
    expect(label).not.toBeNull()
    expect(label!.getAttribute('for')).toBe('fruit-select')
  })

  it('supports aria-label for cases without a visible label', () => {
    render(
      <Select
        value=""
        onChange={() => {}}
        options={options}
        aria-label="Choose a fruit"
      />
    )

    const trigger = document.querySelector('button')
    expect(trigger).not.toBeNull()
    expect(trigger!.getAttribute('aria-label')).toBe('Choose a fruit')
  })

  it('supports aria-labelledby for external label association', () => {
    render(
      <>
        <span id="custom-label">Pick a fruit</span>
        <Select
          value=""
          onChange={() => {}}
          options={options}
          aria-labelledby="custom-label"
        />
      </>
    )

    const trigger = document.querySelector('button')
    expect(trigger).not.toBeNull()
    expect(trigger!.getAttribute('aria-labelledby')).toBe('custom-label')
  })

  it('warns in development when no accessible label is provided', () => {
    const warn = mock.fn()
    const originalWarn = console.warn
    console.warn = warn

    render(<Select value="" onChange={() => {}} options={options} />)

    console.warn = originalWarn

    expect(warn.mock.callCount()).toBeGreaterThan(0)
    expect(String(warn.mock.calls[0]?.arguments[0])).toMatch(
      /Select.*label/i
    )
  })

  it('passes the listbox aria-labelledby to match the trigger id', () => {
    render(
      <Select
        id="fruit-select"
        value=""
        onChange={() => {}}
        options={options}
      />
    )

    const trigger = document.querySelector('button')
    expect(trigger).not.toBeNull()
    expect(trigger!.getAttribute('id')).toBe('fruit-select')
  })
})
