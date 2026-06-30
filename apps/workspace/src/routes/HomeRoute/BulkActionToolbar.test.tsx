import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import React from 'react'
import { BulkActionToolbar } from './BulkActionToolbar'

afterEach(() => {
  cleanup()
})

describe('BulkActionToolbar', () => {
  it('renders nothing when selectedCount is 0', () => {
    const { container } = render(
      <BulkActionToolbar
        selectedCount={0}
        onDelete={() => {}}
        onClearSelection={() => {}}
      />
    )

    assert.equal(container.innerHTML, '')
  })

  it('shows the selected count', () => {
    render(
      <BulkActionToolbar
        selectedCount={3}
        onDelete={() => {}}
        onClearSelection={() => {}}
      />
    )

    assert.ok(screen.getByText('3 selected'))
  })

  it('renders Delete and Clear selection buttons', () => {
    render(
      <BulkActionToolbar
        selectedCount={2}
        onDelete={() => {}}
        onClearSelection={() => {}}
      />
    )

    assert.ok(screen.getByText('Delete'))
    assert.ok(screen.getByText('Clear selection'))
  })

  it('calls onDelete when Delete button is clicked', () => {
    let deleteCalled = false
    render(
      <BulkActionToolbar
        selectedCount={1}
        onDelete={() => {
          deleteCalled = true
        }}
        onClearSelection={() => {}}
      />
    )

    fireEvent.click(screen.getByText('Delete'))
    assert.equal(deleteCalled, true)
  })

  it('calls onClearSelection when Clear selection is clicked', () => {
    let clearCalled = false
    render(
      <BulkActionToolbar
        selectedCount={1}
        onDelete={() => {}}
        onClearSelection={() => {
          clearCalled = true
        }}
      />
    )

    fireEvent.click(screen.getByText('Clear selection'))
    assert.equal(clearCalled, true)
  })
})
