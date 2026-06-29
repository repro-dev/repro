import { cleanup, render, screen } from '@testing-library/react'
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
})
