import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import expect from 'expect'
import { afterEach, describe, it } from 'node:test'
import React from 'react'
import { Button } from '../Button'
import { Input } from '../Input'
import { InputActionRow } from './InputActionRow'

afterEach(cleanup)

describe('InputActionRow (REP-1176)', () => {
  it('keeps the input before adjacent actions in tab order', async () => {
    const user = userEvent.setup()

    render(
      <InputActionRow
        actions={
          <Button variant="contained" type="submit">
            Save changes
          </Button>
        }
      >
        <Input aria-label="Account name" />
      </InputActionRow>
    )

    const input = screen.getByRole('textbox', { name: 'Account name' })
    const action = screen.getByRole('button', { name: 'Save changes' })

    await user.tab()
    expect(document.activeElement).toBe(input)

    await user.tab()
    expect(document.activeElement).toBe(action)
  })

  it('preserves adjacent action accessible names and disabled state', () => {
    render(
      <InputActionRow
        actions={
          <Button variant="contained" disabled>
            Save changes
          </Button>
        }
      >
        <Input aria-label="Account name" />
      </InputActionRow>
    )

    const action = screen.getByRole<HTMLButtonElement>('button', {
      name: 'Save changes',
    })

    expect(action.disabled).toBe(true)
  })
})
