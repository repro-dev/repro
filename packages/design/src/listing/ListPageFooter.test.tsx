import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import assert from 'node:assert/strict'
import { afterEach, describe, it, mock } from 'node:test'
import React from 'react'
import { ListPageFooter } from './ListPageFooter'

afterEach(cleanup)

describe('ListPageFooter', () => {
  it('renders footer text', () => {
    render(
      <ListPageFooter
        footerText="Showing up to 50 items per page"
        currentPage={1}
        hasPreviousPage={false}
        hasNextPage
        pending={false}
        ariaLabel="Items pagination"
        onPageChange={mock.fn()}
      />
    )

    assert.ok(screen.getByText('Showing up to 50 items per page'))
  })

  it('renders Pagination with aria-label', () => {
    render(
      <ListPageFooter
        footerText="Showing up to 50 items per page"
        currentPage={1}
        hasPreviousPage={false}
        hasNextPage
        pending={false}
        ariaLabel="Items pagination"
        onPageChange={mock.fn()}
      />
    )

    assert.ok(screen.getByRole('navigation', { name: 'Items pagination' }))
  })

  it('disables next page when hasNextPage is false', () => {
    render(
      <ListPageFooter
        footerText="Showing up to 50 items per page"
        currentPage={1}
        hasPreviousPage={false}
        hasNextPage={false}
        pending={false}
        ariaLabel="Items pagination"
        onPageChange={mock.fn()}
      />
    )

    assert.equal(
      screen
        .getByRole('button', { name: 'Next page' })
        .hasAttribute('disabled'),
      true
    )
  })

  it('disables controls when pending is true', () => {
    render(
      <ListPageFooter
        footerText="Showing up to 50 items per page"
        currentPage={2}
        hasPreviousPage
        hasNextPage
        pending
        ariaLabel="Items pagination"
        onPageChange={mock.fn()}
      />
    )

    assert.equal(
      screen
        .getByRole('button', { name: 'Next page' })
        .hasAttribute('disabled'),
      true
    )
    assert.equal(
      screen
        .getByRole('button', { name: 'Previous page' })
        .hasAttribute('disabled'),
      true
    )
  })

  it('disables previous page when hasPreviousPage is false', () => {
    render(
      <ListPageFooter
        footerText="Showing up to 50 items per page"
        currentPage={1}
        hasPreviousPage={false}
        hasNextPage
        pending={false}
        ariaLabel="Items pagination"
        onPageChange={mock.fn()}
      />
    )

    assert.equal(
      screen
        .getByRole('button', { name: 'Previous page' })
        .hasAttribute('disabled'),
      true
    )
  })

  it('renders numbered buttons with totalPages and marks the current page (page 1 of 7)', () => {
    render(
      <ListPageFooter
        footerText="Showing up to 50 items per page"
        currentPage={1}
        totalPages={7}
        pending={false}
        ariaLabel="Items pagination"
        onPageChange={mock.fn()}
      />
    )

    // Numbered buttons 1–7 render (1 as the current page)
    assert.ok(screen.getByRole('button', { name: 'Page 1, current page' }))
    for (const page of [2, 3, 4, 5, 6, 7]) {
      assert.ok(
        screen.getByRole('button', { name: `Go to page ${page}` }),
        `expected page ${page} button`
      )
    }

    // Page 1 of 7: prev disabled (negative), next enabled
    assert.equal(
      screen
        .getByRole('button', { name: 'Previous page' })
        .hasAttribute('disabled'),
      true
    )
    assert.equal(
      screen
        .getByRole('button', { name: 'Next page' })
        .hasAttribute('disabled'),
      false
    )

    // aria-current lands on the current page button
    assert.equal(
      screen
        .getByRole('button', { name: 'Page 1, current page' })
        .getAttribute('aria-current'),
      'page'
    )
  })

  it('disables next on the last page with totalPages (page 7 of 7)', () => {
    render(
      <ListPageFooter
        footerText="Showing up to 50 items per page"
        currentPage={7}
        totalPages={7}
        pending={false}
        ariaLabel="Items pagination"
        onPageChange={mock.fn()}
      />
    )

    assert.equal(
      screen
        .getByRole('button', { name: 'Next page' })
        .hasAttribute('disabled'),
      true
    )
    assert.equal(
      screen
        .getByRole('button', { name: 'Previous page' })
        .hasAttribute('disabled'),
      false
    )
  })

  it('calls onPageChange with the destination page when a numbered button is clicked', () => {
    const onPageChange = mock.fn()

    render(
      <ListPageFooter
        footerText="Showing up to 50 items per page"
        currentPage={1}
        totalPages={7}
        pending={false}
        ariaLabel="Items pagination"
        onPageChange={onPageChange}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Go to page 3' }))

    const call = onPageChange.mock.calls[0] as unknown as
      | { arguments: Array<unknown> }
      | undefined

    assert.ok(call)
    assert.equal(call.arguments[0], 3)
  })
})
