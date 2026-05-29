import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import expect from 'expect'
import { afterEach, describe, it } from 'node:test'
import React from 'react'
import { Toggle } from './Toggle'

afterEach(cleanup)

describe('Toggle', () => {
  it('renders a button with role="switch" and aria-checked reflecting checked prop', () => {
    render(<Toggle label="Wi-Fi" checked={false} onChange={() => {}} />)

    const button = screen.getByRole('switch')
    expect(button).toBeDefined()
    expect(button.getAttribute('aria-checked')).toBe('false')
  })

  it('sets aria-checked to true when checked is true', () => {
    render(<Toggle label="Wi-Fi" checked={true} onChange={() => {}} />)

    const button = screen.getByRole('switch')
    expect(button.getAttribute('aria-checked')).toBe('true')
  })

  it('calls onChange with inverted value on click', async () => {
    const user = userEvent.setup()
    let changedValue: boolean | null = null

    render(
      <Toggle
        label="Wi-Fi"
        checked={false}
        onChange={v => {
          changedValue = v
        }}
      />
    )

    await user.click(screen.getByRole('switch'))
    expect(changedValue).toBe(true)
  })

  it('calls onChange with inverted value when checked is true', async () => {
    const user = userEvent.setup()
    let changedValue: boolean | null = null

    render(
      <Toggle
        label="Wi-Fi"
        checked={true}
        onChange={v => {
          changedValue = v
        }}
      />
    )

    await user.click(screen.getByRole('switch'))
    expect(changedValue).toBe(false)
  })

  it('activates on Enter key press', async () => {
    const user = userEvent.setup()
    let changedValue: boolean | null = null

    render(
      <Toggle
        label="Wi-Fi"
        checked={false}
        onChange={v => {
          changedValue = v
        }}
      />
    )

    const button = screen.getByRole('switch')
    button.focus()
    await user.keyboard('{Enter}')
    expect(changedValue).toBe(true)
  })

  it('activates on Space key press', async () => {
    const user = userEvent.setup()
    let changedValue: boolean | null = null

    render(
      <Toggle
        label="Wi-Fi"
        checked={false}
        onChange={v => {
          changedValue = v
        }}
      />
    )

    const button = screen.getByRole('switch')
    button.focus()
    await user.keyboard(' ')
    expect(changedValue).toBe(true)
  })

  it('sets aria-disabled and prevents interaction when disabled', async () => {
    const user = userEvent.setup()
    let changedValue: boolean | null = null

    render(
      <Toggle
        label="Wi-Fi"
        checked={false}
        disabled={true}
        onChange={v => {
          changedValue = v
        }}
      />
    )

    const button = screen.getByRole('switch')
    expect(button.getAttribute('aria-disabled')).toBe('true')
    expect(button.getAttribute('disabled')).not.toBeNull()

    await user.click(button)
    expect(changedValue).toBeNull()
  })

  it('renders label text inside the button', () => {
    render(<Toggle label="Bluetooth" checked={false} onChange={() => {}} />)

    const button = screen.getByRole('switch', { name: 'Bluetooth' })
    expect(button).toBeDefined()
    expect(button.textContent).toContain('Bluetooth')
  })

  it('renders with size variants without error', () => {
    const { rerender } = render(
      <Toggle label="Small" checked={false} onChange={() => {}} size="small" />
    )
    expect(screen.getByRole('switch')).toBeDefined()

    rerender(
      <Toggle
        label="Medium"
        checked={false}
        onChange={() => {}}
        size="medium"
      />
    )
    expect(screen.getByRole('switch')).toBeDefined()

    rerender(
      <Toggle label="Large" checked={false} onChange={() => {}} size="large" />
    )
    expect(screen.getByRole('switch')).toBeDefined()
  })
})
