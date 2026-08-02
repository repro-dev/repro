import { cleanup, render, screen } from '@testing-library/react'
import expect from 'expect'
import { afterEach, describe, it } from 'node:test'
import React from 'react'
import { AdminTable, Table } from './index'

afterEach(cleanup)

function LedgerTable() {
  return (
    <AdminTable aria-label="Ledger">
      <AdminTable.Header>
        <AdminTable.Row>
          <AdminTable.HeaderCell>Name</AdminTable.HeaderCell>
        </AdminTable.Row>
      </AdminTable.Header>
      <AdminTable.Body>
        <AdminTable.Row>
          <AdminTable.Cell>Alice</AdminTable.Cell>
        </AdminTable.Row>
      </AdminTable.Body>
    </AdminTable>
  )
}

describe('AdminTable — admin table variant', () => {
  it('preserves the compound sub-components from Table', () => {
    // forwardRef components are objects; identity with Table's parts is the
    // strongest guarantee that AdminTable.Header-style composition still works.
    expect(AdminTable.Header).toBe(Table.Header)
    expect(AdminTable.Body).toBe(Table.Body)
    expect(AdminTable.Row).toBe(Table.Row)
    expect(AdminTable.Cell).toBe(Table.Cell)
    expect(AdminTable.HeaderCell).toBe(Table.HeaderCell)
  })

  it('renders a transparent-surface table with admin defaults', () => {
    const { container } = render(<LedgerTable />)
    const table = container.querySelector('table') as HTMLTableElement
    expect(table).not.toBeNull()
    expect(table.getAttribute('aria-label')).toBe('Ledger')
    // surface="transparent" is the default: no table background drawn
    expect(table.style.backgroundColor).toBe('transparent')
  })

  it('renders header and body content', () => {
    render(<LedgerTable />)
    expect(screen.getByText('Name')).not.toBeNull()
    expect(screen.getByText('Alice')).not.toBeNull()
  })

  it('allows callers to override the default surface', () => {
    const { container } = render(
      <AdminTable aria-label="Default surface" surface="default">
        <AdminTable.Body>
          <AdminTable.Row>
            <AdminTable.Cell>Alice</AdminTable.Cell>
          </AdminTable.Row>
        </AdminTable.Body>
      </AdminTable>
    )
    const table = container.querySelector('table') as HTMLTableElement
    // Spreading props after the defaults lets callers opt back into a drawn surface
    expect(table.style.backgroundColor).not.toBe('transparent')
  })
})
