import { cleanup, fireEvent, render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import expect from 'expect'
import { afterEach, describe, it } from 'node:test'
import React from 'react'
import { Radio } from './Radio'
import { RadioGroup } from './RadioGroup'

afterEach(cleanup)

describe('RadioGroup', () => {
  it('renders a fieldset with role="radiogroup" and aria-label', () => {
    render(
      <RadioGroup label="Sort by" value="newest" onChange={() => {}}>
        <Radio value="newest" label="Newest" />
        <Radio value="oldest" label="Oldest" />
      </RadioGroup>
    )

    const group = document.querySelector('[role="radiogroup"]')
    expect(group).not.toBeNull()
    expect(group!.getAttribute('aria-label')).toBe('Sort by')
    expect(group!.tagName).toBe('FIELDSET')
  })

  it('renders children Radio components', () => {
    render(
      <RadioGroup label="Sort by" value="newest" onChange={() => {}}>
        <Radio value="newest" label="Newest" />
        <Radio value="oldest" label="Oldest" />
        <Radio value="popular" label="Most popular" />
      </RadioGroup>
    )

    const radios = document.querySelectorAll('input[type="radio"]')
    expect(radios.length).toBe(3)
  })

  it('disables all radio inputs when disabled is true on the group', () => {
    render(
      <RadioGroup
        label="Sort by"
        value="newest"
        onChange={() => {}}
        disabled={true}
      >
        <Radio value="newest" label="Newest" />
        <Radio value="oldest" label="Oldest" />
      </RadioGroup>
    )

    const radios = document.querySelectorAll<HTMLInputElement>(
      'input[type="radio"]'
    )
    for (const radio of radios) {
      expect(radio.disabled).toBe(true)
    }
  })

  it('marks the radio matching value as checked', () => {
    render(
      <RadioGroup label="Sort by" value="oldest" onChange={() => {}}>
        <Radio value="newest" label="Newest" />
        <Radio value="oldest" label="Oldest" />
      </RadioGroup>
    )

    const radios = document.querySelectorAll<HTMLInputElement>(
      'input[type="radio"]'
    )
    expect(radios[0]!.checked).toBe(false)
    expect(radios[1]!.checked).toBe(true)
  })

  it('calls onChange when a radio is clicked', async () => {
    const user = userEvent.setup()
    let selected = 'newest'

    render(
      <RadioGroup
        label="Sort by"
        value={selected}
        onChange={v => {
          selected = v
        }}
      >
        <Radio value="newest" label="Newest" />
        <Radio value="oldest" label="Oldest" />
        <Radio value="popular" label="Most popular" />
      </RadioGroup>
    )

    const radios = document.querySelectorAll<HTMLElement>('label')
    await user.click(radios[2]!)
    expect(selected).toBe('popular')
  })

  it('navigates forward on ArrowDown', () => {
    let selected = 'newest'

    render(
      <RadioGroup
        label="Sort by"
        value={selected}
        onChange={v => {
          selected = v
        }}
      >
        <Radio value="newest" label="Newest" />
        <Radio value="oldest" label="Oldest" />
        <Radio value="popular" label="Most popular" />
      </RadioGroup>
    )

    const fieldset = document.querySelector('fieldset')!
    fireEvent.keyDown(fieldset, { key: 'ArrowDown' })
    expect(selected).toBe('oldest')
  })

  it('navigates forward on ArrowRight', () => {
    let selected = 'newest'

    render(
      <RadioGroup
        label="Sort by"
        value={selected}
        onChange={v => {
          selected = v
        }}
      >
        <Radio value="newest" label="Newest" />
        <Radio value="oldest" label="Oldest" />
        <Radio value="popular" label="Most popular" />
      </RadioGroup>
    )

    const fieldset = document.querySelector('fieldset')!
    fireEvent.keyDown(fieldset, { key: 'ArrowRight' })
    expect(selected).toBe('oldest')
  })

  it('navigates backward on ArrowUp', () => {
    let selected = 'popular'

    render(
      <RadioGroup
        label="Sort by"
        value={selected}
        onChange={v => {
          selected = v
        }}
      >
        <Radio value="newest" label="Newest" />
        <Radio value="oldest" label="Oldest" />
        <Radio value="popular" label="Most popular" />
      </RadioGroup>
    )

    const fieldset = document.querySelector('fieldset')!
    fireEvent.keyDown(fieldset, { key: 'ArrowUp' })
    expect(selected).toBe('oldest')
  })

  it('navigates backward on ArrowLeft', () => {
    let selected = 'popular'

    render(
      <RadioGroup
        label="Sort by"
        value={selected}
        onChange={v => {
          selected = v
        }}
      >
        <Radio value="newest" label="Newest" />
        <Radio value="oldest" label="Oldest" />
        <Radio value="popular" label="Most popular" />
      </RadioGroup>
    )

    const fieldset = document.querySelector('fieldset')!
    fireEvent.keyDown(fieldset, { key: 'ArrowLeft' })
    expect(selected).toBe('oldest')
  })

  it('wraps from last to first on ArrowDown', () => {
    let selected = 'popular'

    render(
      <RadioGroup
        label="Sort by"
        value={selected}
        onChange={v => {
          selected = v
        }}
      >
        <Radio value="newest" label="Newest" />
        <Radio value="oldest" label="Oldest" />
        <Radio value="popular" label="Most popular" />
      </RadioGroup>
    )

    const fieldset = document.querySelector('fieldset')!
    fireEvent.keyDown(fieldset, { key: 'ArrowDown' })
    expect(selected).toBe('newest')
  })

  it('wraps from first to last on ArrowUp', () => {
    let selected = 'newest'

    render(
      <RadioGroup
        label="Sort by"
        value={selected}
        onChange={v => {
          selected = v
        }}
      >
        <Radio value="newest" label="Newest" />
        <Radio value="oldest" label="Oldest" />
        <Radio value="popular" label="Most popular" />
      </RadioGroup>
    )

    const fieldset = document.querySelector('fieldset')!
    fireEvent.keyDown(fieldset, { key: 'ArrowUp' })
    expect(selected).toBe('popular')
  })

  it('selects first option on Home', () => {
    let selected = 'popular'

    render(
      <RadioGroup
        label="Sort by"
        value={selected}
        onChange={v => {
          selected = v
        }}
      >
        <Radio value="newest" label="Newest" />
        <Radio value="oldest" label="Oldest" />
        <Radio value="popular" label="Most popular" />
      </RadioGroup>
    )

    const fieldset = document.querySelector('fieldset')!
    fireEvent.keyDown(fieldset, { key: 'Home' })
    expect(selected).toBe('newest')
  })

  it('selects last option on End', () => {
    let selected = 'newest'

    render(
      <RadioGroup
        label="Sort by"
        value={selected}
        onChange={v => {
          selected = v
        }}
      >
        <Radio value="newest" label="Newest" />
        <Radio value="oldest" label="Oldest" />
        <Radio value="popular" label="Most popular" />
      </RadioGroup>
    )

    const fieldset = document.querySelector('fieldset')!
    fireEvent.keyDown(fieldset, { key: 'End' })
    expect(selected).toBe('popular')
  })
})
