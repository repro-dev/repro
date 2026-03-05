import { cleanup, render } from '@testing-library/react'
import expect from 'expect'
import { afterEach, describe, it, mock } from 'node:test'
import React, { act } from 'react'
import { Label } from '../Label/Label'
import { PortalRootProvider } from '../Portal/PortalRootProvider'
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
    expect(String(warn.mock.calls[0]?.arguments[0])).toMatch(/Select.*label/i)
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

describe('Select — controlled and uncontrolled modes (REP-296)', () => {
  it('controlled mode reflects external value', () => {
    render(
      <Select
        value="banana"
        onChange={() => {}}
        options={options}
        aria-label="Fruit"
      />
    )

    const trigger = document.querySelector('button')
    expect(trigger).not.toBeNull()
    expect(trigger!.textContent).toContain('Banana')
  })

  it('controlled mode calls onChange but does not update display without external re-render', () => {
    const onChange = mock.fn()

    render(
      <PortalRootProvider>
        <Select
          value="apple"
          onChange={onChange}
          options={options}
          aria-label="Fruit"
        />
      </PortalRootProvider>
    )

    const trigger = document.querySelector('button')!
    act(() => {
      trigger.click()
    })

    const optionElements = document.querySelectorAll('[role="option"]')
    act(() => {
      ;(optionElements[1] as HTMLElement).click()
    })

    expect(onChange.mock.callCount()).toBe(1)
    expect(onChange.mock.calls[0]?.arguments[0]).toBe('banana')
  })

  it('uncontrolled mode manages internal state with defaultValue', () => {
    render(<Select defaultValue="apple" options={options} aria-label="Fruit" />)

    const trigger = document.querySelector('button')
    expect(trigger).not.toBeNull()
    expect(trigger!.textContent).toContain('Apple')
  })

  it('uncontrolled mode updates display on selection', () => {
    render(
      <PortalRootProvider>
        <Select defaultValue="apple" options={options} aria-label="Fruit" />
      </PortalRootProvider>
    )

    const trigger = document.querySelector('button')!

    act(() => {
      trigger.click()
    })

    const optionElements = document.querySelectorAll('[role="option"]')
    act(() => {
      ;(optionElements[2] as HTMLElement).click()
    })

    expect(trigger.textContent).toContain('Cherry')
  })

  it('uncontrolled mode calls onChange on selection', () => {
    const onChange = mock.fn()

    render(
      <PortalRootProvider>
        <Select
          defaultValue="apple"
          onChange={onChange}
          options={options}
          aria-label="Fruit"
        />
      </PortalRootProvider>
    )

    const trigger = document.querySelector('button')!

    act(() => {
      trigger.click()
    })

    const optionElements = document.querySelectorAll('[role="option"]')
    act(() => {
      ;(optionElements[1] as HTMLElement).click()
    })

    expect(onChange.mock.callCount()).toBe(1)
    expect(onChange.mock.calls[0]?.arguments[0]).toBe('banana')
  })

  it('warns when switching from uncontrolled to controlled', () => {
    const warn = mock.fn()
    const originalWarn = console.warn
    console.warn = warn

    const { rerender } = render(
      <Select defaultValue="apple" options={options} aria-label="Fruit" />
    )

    rerender(
      <Select
        value="banana"
        onChange={() => {}}
        options={options}
        aria-label="Fruit"
      />
    )

    console.warn = originalWarn

    const warnings = warn.mock.calls.map(c => String(c.arguments[0]))
    const switchWarning = warnings.find(
      w => /controlled/i.test(w) && /uncontrolled/i.test(w)
    )
    expect(switchWarning).toBeDefined()
  })

  it('renders with no value and shows placeholder when uncontrolled with no defaultValue', () => {
    render(
      <Select options={options} aria-label="Fruit" placeholder="Pick one" />
    )

    const trigger = document.querySelector('button')
    expect(trigger).not.toBeNull()
    expect(trigger!.textContent).toContain('Pick one')
  })
})
