import { cleanup, render, screen } from '@testing-library/react'
import expect from 'expect'
import { afterEach, describe, it } from 'node:test'
import React from 'react'
import { Keycap } from '../Keycap'

afterEach(cleanup)

describe('Keycap', () => {
  it('renders label text and kbd element', () => {
    render(<Keycap label="Space" />)

    const kbd = screen.getByText('Space')
    expect(kbd).toBeDefined()
    expect(kbd.tagName).toBe('KBD')
  })

  it('renders muted variant without error', () => {
    render(<Keycap muted label="←" />)

    expect(screen.getByText('←')).toBeDefined()
  })
})
