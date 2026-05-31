import { getCSSText } from '@repro/testing-utils'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import expect from 'expect'
import { afterEach, describe, it } from 'node:test'
import React from 'react'
import { formControlHeight } from '../tokens/formControl'
import { TextField } from './TextField'

afterEach(cleanup)

describe('TextField', () => {
  it('renders label and input', () => {
    render(<TextField label="Email" id="email" />)
    const input = screen.getByRole('textbox', { name: 'Email' })
    expect(screen.getByText('Email')).toBeDefined()
    expect(input.getAttribute('id')).toBe('email')
  })

  it('delegates value and onChange', async () => {
    const user = userEvent.setup()
    let value = ''
    const onChange: React.ChangeEventHandler<
      HTMLInputElement | HTMLTextAreaElement
    > = evt => {
      value = evt.currentTarget.value
    }

    render(<TextField label="Name" value="" onChange={onChange} />)
    const input = screen.getByRole('textbox', { name: 'Name' })
    await user.type(input, 'a')
    expect(value).toBe('a')
  })

  it('renders error state', () => {
    render(
      <TextField
        label="Email"
        invalid
        error={{ message: 'Email is required' }}
      />
    )
    expect(screen.getByText('Email is required')).toBeDefined()
    const input = screen.getByRole('textbox', { name: 'Email' })
    expect(input.getAttribute('aria-invalid')).toBe('true')
  })

  it('renders help text', () => {
    render(<TextField label="Password" help="Must be at least 8 characters" />)
    expect(screen.getByText('Must be at least 8 characters')).toBeDefined()
  })

  it('disabled state disables the input', () => {
    render(<TextField label="Name" disabled />)
    const input = screen.getByRole('textbox', { name: 'Name' })
    expect(input.hasAttribute('disabled')).toBe(true)
  })

  it('required state shows required indicator', () => {
    render(<TextField label="Name" required />)
    // Label renders "Required" text when required is true
    expect(screen.getByText('Required')).toBeDefined()
  })

  it('renders each size with correct formControlHeight', () => {
    for (const size of ['small', 'medium', 'large'] as const) {
      const { unmount } = render(
        <TextField label={`Field ${size}`} size={size} />
      )
      const css = getCSSText()
      expect(css).toContain(`height: ${formControlHeight[size]}px`)
      unmount()
    }
  })

  it('wires FormField context: id, aria-describedby, aria-invalid', () => {
    render(
      <TextField
        label="Name"
        id="full-name"
        invalid
        error={{ message: 'Name is required' }}
      />
    )
    const input = screen.getByRole('textbox', { name: 'Name' })
    expect(input.getAttribute('id')).toBe('full-name')
    expect(input.getAttribute('aria-describedby')).toBe('full-name-error')
    expect(input.getAttribute('aria-invalid')).toBe('true')
  })
})
