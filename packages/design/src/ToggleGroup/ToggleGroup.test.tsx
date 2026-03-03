import { cleanup, render } from '@testing-library/react'
import expect from 'expect'
import { afterEach, describe, it } from 'node:test'
import React, { act, useState } from 'react'
import { ToggleGroup } from './ToggleGroup'

afterEach(cleanup)

function pressKey(key: string, target?: Element) {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
  })
  ;(target ?? document.activeElement ?? document).dispatchEvent(event)
  return event
}

const options = [
  { value: 1, label: 'One' },
  { value: 2, label: 'Two' },
  { value: 3, label: 'Three' },
]

describe('ToggleGroup', () => {
  it('renders with radiogroup role', () => {
    render(<ToggleGroup options={options} selected={1} onChange={() => {}} />)

    const group = document.querySelector('[role="radiogroup"]')
    expect(group).not.toBeNull()
  })

  it('renders radio buttons for each option', () => {
    render(<ToggleGroup options={options} selected={1} onChange={() => {}} />)

    const radios = document.querySelectorAll('[role="radio"]')
    expect(radios.length).toBe(3)
  })

  it('sets aria-checked on the selected option', () => {
    render(<ToggleGroup options={options} selected={2} onChange={() => {}} />)

    const radios = document.querySelectorAll('[role="radio"]')
    expect(radios[0]?.getAttribute('aria-checked')).toBe('false')
    expect(radios[1]?.getAttribute('aria-checked')).toBe('true')
    expect(radios[2]?.getAttribute('aria-checked')).toBe('false')
  })

  it('uses roving tabindex — only selected option has tabIndex 0', () => {
    render(<ToggleGroup options={options} selected={2} onChange={() => {}} />)

    const radios = document.querySelectorAll('[role="radio"]')
    expect((radios[0] as HTMLElement).tabIndex).toBe(-1)
    expect((radios[1] as HTMLElement).tabIndex).toBe(0)
    expect((radios[2] as HTMLElement).tabIndex).toBe(-1)
  })

  it('moves selection forward on ArrowRight', () => {
    let selected = 1
    const onChange = (val: number) => {
      selected = val
    }

    render(
      <ToggleGroup options={options} selected={selected} onChange={onChange} />
    )

    const radios = document.querySelectorAll<HTMLElement>('[role="radio"]')
    radios[0]!.focus()
    pressKey('ArrowRight')

    expect(selected).toBe(2)
  })

  it('moves selection backward on ArrowLeft', () => {
    let selected = 2
    const onChange = (val: number) => {
      selected = val
    }

    render(
      <ToggleGroup options={options} selected={selected} onChange={onChange} />
    )

    const radios = document.querySelectorAll<HTMLElement>('[role="radio"]')
    radios[1]!.focus()
    pressKey('ArrowLeft')

    expect(selected).toBe(1)
  })

  it('wraps from last to first on ArrowRight', () => {
    let selected = 3
    const onChange = (val: number) => {
      selected = val
    }

    render(
      <ToggleGroup options={options} selected={selected} onChange={onChange} />
    )

    const radios = document.querySelectorAll<HTMLElement>('[role="radio"]')
    radios[2]!.focus()
    pressKey('ArrowRight')

    expect(selected).toBe(1)
  })

  it('wraps from first to last on ArrowLeft', () => {
    let selected = 1
    const onChange = (val: number) => {
      selected = val
    }

    render(
      <ToggleGroup options={options} selected={selected} onChange={onChange} />
    )

    const radios = document.querySelectorAll<HTMLElement>('[role="radio"]')
    radios[0]!.focus()
    pressKey('ArrowLeft')

    expect(selected).toBe(3)
  })

  it('moves to first option on Home', () => {
    let selected = 3
    const onChange = (val: number) => {
      selected = val
    }

    render(
      <ToggleGroup options={options} selected={selected} onChange={onChange} />
    )

    const radios = document.querySelectorAll<HTMLElement>('[role="radio"]')
    radios[2]!.focus()
    pressKey('Home')

    expect(selected).toBe(1)
  })

  it('moves to last option on End', () => {
    let selected = 1
    const onChange = (val: number) => {
      selected = val
    }

    render(
      <ToggleGroup options={options} selected={selected} onChange={onChange} />
    )

    const radios = document.querySelectorAll<HTMLElement>('[role="radio"]')
    radios[0]!.focus()
    pressKey('End')

    expect(selected).toBe(3)
  })

  it('moves DOM focus to the newly selected radio on keyboard navigation', async () => {
    let selected = 1

    function Wrapper() {
      const [sel, setSel] = useState(selected)
      return (
        <ToggleGroup
          options={options}
          selected={sel}
          onChange={(val: number) => {
            selected = val
            setSel(val)
          }}
        />
      )
    }

    render(<Wrapper />)

    const radios = document.querySelectorAll<HTMLElement>('[role="radio"]')
    radios[0]!.focus()
    expect(document.activeElement).toBe(radios[0])

    await act(() => {
      pressKey('ArrowRight')
    })

    const updatedRadios =
      document.querySelectorAll<HTMLElement>('[role="radio"]')
    expect(document.activeElement).toBe(updatedRadios[1])
  })

  it('selects an option on click', () => {
    let selected = 1
    const onChange = (val: number) => {
      selected = val
    }

    render(
      <ToggleGroup options={options} selected={selected} onChange={onChange} />
    )

    const radios = document.querySelectorAll<HTMLElement>('[role="radio"]')
    radios[2]!.click()

    expect(selected).toBe(3)
  })

  it('supports ArrowDown and ArrowUp as alternatives', () => {
    let selected = 1
    const onChange = (val: number) => {
      selected = val
    }

    const { rerender } = render(
      <ToggleGroup options={options} selected={selected} onChange={onChange} />
    )

    const radios = document.querySelectorAll<HTMLElement>('[role="radio"]')
    radios[0]!.focus()
    pressKey('ArrowDown')
    expect(selected).toBe(2)

    selected = 2
    rerender(
      <ToggleGroup options={options} selected={selected} onChange={onChange} />
    )
    const updatedRadios =
      document.querySelectorAll<HTMLElement>('[role="radio"]')
    updatedRadios[1]!.focus()
    pressKey('ArrowUp')
    expect(selected).toBe(1)
  })
})
