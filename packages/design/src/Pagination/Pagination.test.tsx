import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import expect from 'expect'
import { afterEach, describe, it } from 'node:test'
import React from 'react'
import { Pagination } from './Pagination'

afterEach(cleanup)

describe('Pagination', () => {
  it('renders compact page ranges with accessible ellipsis for large totals', () => {
    render(
      <Pagination currentPage={1} totalPages={10} onPageChange={() => {}} />
    )

    for (const page of [2, 3, 8, 9, 10]) {
      expect(
        screen.getByRole('button', { name: `Go to page ${page}` })
      ).toBeDefined()
    }

    expect(
      screen.getByRole('button', { name: 'Page 1, current page' })
    ).toBeDefined()

    expect(screen.queryByRole('button', { name: /page 4/i })).toBeNull()
    expect(screen.getByText('…')).toBeDefined()
    expect(screen.getByText('Skipped pages')).toBeDefined()
  })

  it('renders all page controls without ellipsis for small totals', () => {
    render(
      <Pagination currentPage={2} totalPages={5} onPageChange={() => {}} />
    )

    for (const page of [1, 2, 3, 4, 5]) {
      expect(
        screen.getByRole('button', { name: new RegExp(`page ${page}`, 'i') })
      ).toBeDefined()
    }

    expect(screen.queryByText('…')).toBeNull()
  })

  it('marks the current page and suppresses callbacks for current-page clicks', async () => {
    const user = userEvent.setup()
    const changes: number[] = []

    render(
      <Pagination
        currentPage={3}
        totalPages={5}
        onPageChange={page => changes.push(page)}
      />
    )

    const current = screen.getByRole('button', { name: 'Page 3, current page' })
    expect(current.getAttribute('aria-current')).toBe('page')

    await user.click(current)
    expect(changes).toEqual([])
  })

  it('disables previous and next controls at known boundaries', () => {
    const { rerender } = render(
      <Pagination currentPage={1} totalPages={3} onPageChange={() => {}} />
    )

    expect(
      screen
        .getByRole('button', { name: 'Previous page' })
        .hasAttribute('disabled')
    ).toBe(true)
    expect(
      screen.getByRole('button', { name: 'Next page' }).hasAttribute('disabled')
    ).toBe(false)

    rerender(
      <Pagination currentPage={3} totalPages={3} onPageChange={() => {}} />
    )

    expect(
      screen
        .getByRole('button', { name: 'Previous page' })
        .hasAttribute('disabled')
    ).toBe(false)
    expect(
      screen.getByRole('button', { name: 'Next page' }).hasAttribute('disabled')
    ).toBe(true)
  })

  it('disables all controls while pending and suppresses callbacks', async () => {
    const user = userEvent.setup()
    const changes: number[] = []

    render(
      <Pagination
        currentPage={2}
        totalPages={4}
        pending
        onPageChange={page => changes.push(page)}
      />
    )

    const navigation = screen.getByRole('navigation', { name: 'Pagination' })
    expect(navigation.getAttribute('aria-busy')).toBe('true')

    await user.click(screen.getByRole('button', { name: 'Next page' }))
    await user.click(screen.getByRole('button', { name: 'Go to page 3' }))

    expect(
      screen
        .getAllByRole('button')
        .every(button => button.hasAttribute('disabled'))
    ).toBe(true)
    expect(changes).toEqual([])
  })

  it('renders cursor-backed mode without numbered jumps', async () => {
    const user = userEvent.setup()
    const changes: number[] = []

    render(
      <Pagination
        currentPage={2}
        hasPreviousPage
        hasNextPage={false}
        onPageChange={page => changes.push(page)}
      />
    )

    expect(screen.getByRole('navigation', { name: 'Pagination' })).toBeDefined()
    expect(screen.queryByText('Page 2')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Go to page 2' })).toBeNull()
    expect(
      screen.queryByRole('button', { name: 'Page 2, current page' })
    ).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Next page' }).hasAttribute('disabled')
    ).toBe(true)

    await user.click(screen.getByRole('button', { name: 'Previous page' }))
    expect(changes).toEqual([1])
  })
})
