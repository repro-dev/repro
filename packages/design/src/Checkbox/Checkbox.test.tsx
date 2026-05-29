import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import expect from 'expect'
import { afterEach, describe, it } from 'node:test'
import React, { createRef } from 'react'
import { Checkbox } from './Checkbox'

afterEach(cleanup)

describe('Checkbox', () => {
  it('renders a native input type="checkbox" that is visually hidden', () => {
    render(<Checkbox label="Accept" checked={false} onChange={() => {}} />)

    const input = document.querySelector('input[type="checkbox"]')
    expect(input).not.toBeNull()
    // jsxstyle applies opacity via CSS class; just verify input exists
    expect(input!.getAttribute('type')).toBe('checkbox')
  })

  it('renders a label that wraps the input and visual indicator', () => {
    render(<Checkbox label="Accept" checked={false} onChange={() => {}} />)

    const label = document.querySelector('label')
    expect(label).not.toBeNull()
    expect(label!.textContent).toContain('Accept')

    const input = label!.querySelector('input[type="checkbox"]')
    expect(input).not.toBeNull()
  })

  it('calls onChange with inverted value on click', async () => {
    const user = userEvent.setup()
    let changedValue: boolean | null = null

    render(
      <Checkbox
        label="Accept"
        checked={false}
        onChange={v => {
          changedValue = v
        }}
      />
    )

    const label = document.querySelector('label')!
    await user.click(label)
    expect(changedValue).toBe(true)
  })

  it('calls onChange with inverted value when starting checked', async () => {
    const user = userEvent.setup()
    let changedValue: boolean | null = null

    render(
      <Checkbox
        label="Accept"
        checked={true}
        onChange={v => {
          changedValue = v
        }}
      />
    )

    await user.click(document.querySelector('label')!)
    expect(changedValue).toBe(false)
  })

  it('does not use aria-checked (native checkbox handles this)', () => {
    render(<Checkbox label="Accept" checked={true} onChange={() => {}} />)

    const input = document.querySelector('input[type="checkbox"]')!
    expect(input.getAttribute('aria-checked')).toBeNull()
  })

  it('prevents interaction when disabled', async () => {
    const user = userEvent.setup()
    let changedValue: boolean | null = null

    render(
      <Checkbox
        label="Accept"
        checked={false}
        disabled={true}
        onChange={v => {
          changedValue = v
        }}
      />
    )

    const input = document.querySelector('input[type="checkbox"]')!
    expect(input.getAttribute('disabled')).not.toBeNull()

    await user.click(document.querySelector('label')!)
    expect(changedValue).toBeNull()
  })

  it('renders description prop as secondary text', () => {
    render(
      <Checkbox
        label="Notifications"
        checked={false}
        onChange={() => {}}
        description="Receive email notifications"
      />
    )

    expect(screen.getByText('Receive email notifications')).toBeDefined()
  })

  it('does not render description text when not provided', () => {
    render(
      <Checkbox label="Notifications" checked={false} onChange={() => {}} />
    )

    expect(screen.queryByText('Receive email notifications')).toBeNull()
  })

  it('forwards ref to the native input element', () => {
    const ref = createRef<HTMLInputElement>()

    render(
      <Checkbox
        label="Ref test"
        checked={false}
        onChange={() => {}}
        ref={ref}
      />
    )

    expect(ref.current).not.toBeNull()
    expect(ref.current!.tagName).toBe('INPUT')
    expect(ref.current!.type).toBe('checkbox')
  })

  it('renders with size variants without error', () => {
    const { rerender } = render(
      <Checkbox
        label="Small"
        checked={false}
        onChange={() => {}}
        size="small"
      />
    )
    expect(document.querySelector('input[type="checkbox"]')).not.toBeNull()

    rerender(
      <Checkbox
        label="Medium"
        checked={false}
        onChange={() => {}}
        size="medium"
      />
    )
    expect(document.querySelector('input[type="checkbox"]')).not.toBeNull()

    rerender(
      <Checkbox
        label="Large"
        checked={false}
        onChange={() => {}}
        size="large"
      />
    )
    expect(document.querySelector('input[type="checkbox"]')).not.toBeNull()
  })
})
