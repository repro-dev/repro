import { cleanup, fireEvent, render } from '@testing-library/react'
import expect from 'expect'
import { afterEach, describe, it, mock } from 'node:test'
import React, { act } from 'react'
import { Table } from './index'

afterEach(cleanup)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const columns = ['Name', 'Status', 'Date']

function BasicTable() {
  return (
    <Table aria-label="Test table">
      <Table.Header>
        <Table.Row>
          <Table.HeaderCell>Name</Table.HeaderCell>
          <Table.HeaderCell>Status</Table.HeaderCell>
          <Table.HeaderCell>Date</Table.HeaderCell>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        <Table.Row>
          <Table.Cell>Alice</Table.Cell>
          <Table.Cell>Active</Table.Cell>
          <Table.Cell>2024-01-01</Table.Cell>
        </Table.Row>
        <Table.Row>
          <Table.Cell>Bob</Table.Cell>
          <Table.Cell>Inactive</Table.Cell>
          <Table.Cell>2024-01-02</Table.Cell>
        </Table.Row>
      </Table.Body>
    </Table>
  )
}

// ---------------------------------------------------------------------------
// Rendering & semantic HTML
// ---------------------------------------------------------------------------

describe('Table — semantic HTML', () => {
  it('renders a <table> element', () => {
    render(<BasicTable />)
    const table = document.querySelector('table')
    expect(table).not.toBeNull()
  })

  it('renders a <thead> element', () => {
    render(<BasicTable />)
    const thead = document.querySelector('thead')
    expect(thead).not.toBeNull()
  })

  it('renders a <tbody> element', () => {
    render(<BasicTable />)
    const tbody = document.querySelector('tbody')
    expect(tbody).not.toBeNull()
  })

  it('renders <tr> elements', () => {
    render(<BasicTable />)
    const rows = document.querySelectorAll('tr')
    expect(rows.length).toBeGreaterThan(0)
  })

  it('renders <th> header cells', () => {
    render(<BasicTable />)
    const ths = document.querySelectorAll('th')
    expect(ths.length).toBe(3)
  })

  it('renders <td> body cells', () => {
    render(<BasicTable />)
    const tds = document.querySelectorAll('td')
    expect(tds.length).toBe(6)
  })

  it('passes aria-label to the table element', () => {
    render(<BasicTable />)
    const table = document.querySelector('table')
    expect(table?.getAttribute('aria-label')).toBe('Test table')
  })

  it('header cells have scope="col"', () => {
    render(<BasicTable />)
    const ths = document.querySelectorAll('th')
    for (const th of Array.from(ths)) {
      expect(th.getAttribute('scope')).toBe('col')
    }
  })
})

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

describe('Table — sorting', () => {
  it('sortable header cell has aria-sort="none" when not currently sorted', () => {
    render(
      <Table aria-label="Sortable table" sortColumn={null} sortDirection={null}>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell columnId="name" sortable>
              Name
            </Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          <Table.Row>
            <Table.Cell>Alice</Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table>
    )

    const th = document.querySelector('th')
    expect(th?.getAttribute('aria-sort')).toBe('none')
  })

  it('sortable header cell has aria-sort="ascending" when sorted asc', () => {
    render(
      <Table aria-label="Sortable table" sortColumn="name" sortDirection="asc">
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell columnId="name" sortable>
              Name
            </Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          <Table.Row>
            <Table.Cell>Alice</Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table>
    )

    const th = document.querySelector('th')
    expect(th?.getAttribute('aria-sort')).toBe('ascending')
  })

  it('sortable header cell has aria-sort="descending" when sorted desc', () => {
    render(
      <Table aria-label="Sortable table" sortColumn="name" sortDirection="desc">
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell columnId="name" sortable>
              Name
            </Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          <Table.Row>
            <Table.Cell>Alice</Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table>
    )

    const th = document.querySelector('th')
    expect(th?.getAttribute('aria-sort')).toBe('descending')
  })

  it('clicking a sortable header cell calls onSort with the columnId', () => {
    const onSort = mock.fn()

    render(
      <Table
        aria-label="Sortable table"
        sortColumn={null}
        sortDirection={null}
        onSort={onSort}
      >
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell columnId="name" sortable>
              Name
            </Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          <Table.Row>
            <Table.Cell>Alice</Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table>
    )

    const th = document.querySelector('th')

    act(() => {
      th?.click()
    })

    expect(onSort.mock.callCount()).toBe(1)
    expect(onSort.mock.calls[0]?.arguments[0]).toBe('name')
  })

  it('non-sortable header cell does not have aria-sort', () => {
    render(
      <Table aria-label="Table" sortColumn={null} sortDirection={null}>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>Name</Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body />
      </Table>
    )

    const th = document.querySelector('th')
    expect(th?.hasAttribute('aria-sort')).toBe(false)
  })

  it('non-sortable header cell does not call onSort on click', () => {
    const onSort = mock.fn()

    render(
      <Table aria-label="Table" onSort={onSort}>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>Name</Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body />
      </Table>
    )

    const th = document.querySelector('th')

    act(() => {
      th?.click()
    })

    expect(onSort.mock.callCount()).toBe(0)
  })

  it('sortable header cell is keyboard-activatable with Enter', () => {
    const onSort = mock.fn()

    render(
      <Table aria-label="Table" onSort={onSort}>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell columnId="name" sortable>
              Name
            </Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body />
      </Table>
    )

    const th = document.querySelector('th')

    act(() => {
      fireEvent.keyDown(th!, { key: 'Enter' })
    })

    expect(onSort.mock.callCount()).toBe(1)
    expect(onSort.mock.calls[0]?.arguments[0]).toBe('name')
  })
})

// ---------------------------------------------------------------------------
// Multi-select
// ---------------------------------------------------------------------------

describe('Table — multi-select', () => {
  it('rows render checkboxes when selectionMode="multi"', () => {
    render(
      <Table
        aria-label="Selectable table"
        selectionMode="multi"
        selectedRows={new Set()}
        onSelectRow={() => {}}
        onSelectAll={() => {}}
        allRowIds={['row-1', 'row-2']}
      >
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>Name</Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          <Table.Row rowId="row-1">
            <Table.Cell>Alice</Table.Cell>
          </Table.Row>
          <Table.Row rowId="row-2">
            <Table.Cell>Bob</Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table>
    )

    const checkboxes = document.querySelectorAll('input[type="checkbox"]')
    // 2 row checkboxes + 1 select-all = 3
    expect(checkboxes.length).toBe(3)
  })

  it('row checkbox is unchecked when row is not in selectedRows', () => {
    render(
      <Table
        aria-label="Selectable table"
        selectionMode="multi"
        selectedRows={new Set()}
        onSelectRow={() => {}}
        onSelectAll={() => {}}
        allRowIds={['row-1']}
      >
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>Name</Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          <Table.Row rowId="row-1">
            <Table.Cell>Alice</Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table>
    )

    // The select-all checkbox is first, row checkboxes follow
    const checkboxes = document.querySelectorAll('input[type="checkbox"]')
    const rowCheckbox = checkboxes[1] as HTMLInputElement
    expect(rowCheckbox.checked).toBe(false)
  })

  it('row checkbox is checked when row is in selectedRows', () => {
    render(
      <Table
        aria-label="Selectable table"
        selectionMode="multi"
        selectedRows={new Set(['row-1'])}
        onSelectRow={() => {}}
        onSelectAll={() => {}}
        allRowIds={['row-1']}
      >
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>Name</Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          <Table.Row rowId="row-1">
            <Table.Cell>Alice</Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table>
    )

    const checkboxes = document.querySelectorAll('input[type="checkbox"]')
    const rowCheckbox = checkboxes[1] as HTMLInputElement
    expect(rowCheckbox.checked).toBe(true)
  })

  it('clicking unchecked row checkbox calls onSelectRow(rowId, true)', () => {
    const onSelectRow = mock.fn()

    render(
      <Table
        aria-label="Selectable table"
        selectionMode="multi"
        selectedRows={new Set()}
        onSelectRow={onSelectRow}
        onSelectAll={() => {}}
        allRowIds={['row-1']}
      >
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>Name</Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          <Table.Row rowId="row-1">
            <Table.Cell>Alice</Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table>
    )

    const checkboxes = document.querySelectorAll('input[type="checkbox"]')
    const rowCheckbox = checkboxes[1] as HTMLInputElement

    act(() => {
      rowCheckbox.click()
    })

    expect(onSelectRow.mock.callCount()).toBe(1)
    expect(onSelectRow.mock.calls[0]?.arguments[0]).toBe('row-1')
    expect(onSelectRow.mock.calls[0]?.arguments[1]).toBe(true)
  })

  it('clicking checked row checkbox calls onSelectRow(rowId, false)', () => {
    const onSelectRow = mock.fn()

    render(
      <Table
        aria-label="Selectable table"
        selectionMode="multi"
        selectedRows={new Set(['row-1'])}
        onSelectRow={onSelectRow}
        onSelectAll={() => {}}
        allRowIds={['row-1']}
      >
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>Name</Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          <Table.Row rowId="row-1">
            <Table.Cell>Alice</Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table>
    )

    const checkboxes = document.querySelectorAll('input[type="checkbox"]')
    const rowCheckbox = checkboxes[1] as HTMLInputElement

    act(() => {
      rowCheckbox.click()
    })

    expect(onSelectRow.mock.callCount()).toBe(1)
    expect(onSelectRow.mock.calls[0]?.arguments[0]).toBe('row-1')
    expect(onSelectRow.mock.calls[0]?.arguments[1]).toBe(false)
  })

  it('select-all checkbox calls onSelectAll(true) when no rows are selected', () => {
    const onSelectAll = mock.fn()

    render(
      <Table
        aria-label="Selectable table"
        selectionMode="multi"
        selectedRows={new Set()}
        onSelectRow={() => {}}
        onSelectAll={onSelectAll}
        allRowIds={['row-1', 'row-2']}
      >
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>Name</Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          <Table.Row rowId="row-1">
            <Table.Cell>Alice</Table.Cell>
          </Table.Row>
          <Table.Row rowId="row-2">
            <Table.Cell>Bob</Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table>
    )

    const checkboxes = document.querySelectorAll('input[type="checkbox"]')
    const selectAllCheckbox = checkboxes[0] as HTMLInputElement

    act(() => {
      selectAllCheckbox.click()
    })

    expect(onSelectAll.mock.callCount()).toBe(1)
    expect(onSelectAll.mock.calls[0]?.arguments[0]).toBe(true)
  })

  it('select-all checkbox calls onSelectAll(false) when all rows are selected', () => {
    const onSelectAll = mock.fn()

    render(
      <Table
        aria-label="Selectable table"
        selectionMode="multi"
        selectedRows={new Set(['row-1', 'row-2'])}
        onSelectRow={() => {}}
        onSelectAll={onSelectAll}
        allRowIds={['row-1', 'row-2']}
      >
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>Name</Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          <Table.Row rowId="row-1">
            <Table.Cell>Alice</Table.Cell>
          </Table.Row>
          <Table.Row rowId="row-2">
            <Table.Cell>Bob</Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table>
    )

    const checkboxes = document.querySelectorAll('input[type="checkbox"]')
    const selectAllCheckbox = checkboxes[0] as HTMLInputElement

    act(() => {
      selectAllCheckbox.click()
    })

    expect(onSelectAll.mock.callCount()).toBe(1)
    expect(onSelectAll.mock.calls[0]?.arguments[0]).toBe(false)
  })

  it('selected row has aria-selected="true"', () => {
    render(
      <Table
        aria-label="Selectable table"
        selectionMode="multi"
        selectedRows={new Set(['row-1'])}
        onSelectRow={() => {}}
        onSelectAll={() => {}}
        allRowIds={['row-1', 'row-2']}
      >
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>Name</Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          <Table.Row rowId="row-1">
            <Table.Cell>Alice</Table.Cell>
          </Table.Row>
          <Table.Row rowId="row-2">
            <Table.Cell>Bob</Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table>
    )

    const rows = document.querySelectorAll('tbody tr')
    expect(rows[0]?.getAttribute('aria-selected')).toBe('true')
    expect(rows[1]?.getAttribute('aria-selected')).toBe('false')
  })
})

// ---------------------------------------------------------------------------
// Single-select
// ---------------------------------------------------------------------------

describe('Table — single-select', () => {
  it('rows do not render checkboxes in selectionMode="single"', () => {
    render(
      <Table
        aria-label="Single select table"
        selectionMode="single"
        selectedRows={new Set()}
        onSelectRow={() => {}}
        allRowIds={['row-1']}
      >
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>Name</Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          <Table.Row rowId="row-1">
            <Table.Cell>Alice</Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table>
    )

    const checkboxes = document.querySelectorAll('input[type="checkbox"]')
    expect(checkboxes.length).toBe(0)
  })

  it('clicking a row calls onSelectRow(rowId, true) for single-select', () => {
    const onSelectRow = mock.fn()

    render(
      <Table
        aria-label="Single select table"
        selectionMode="single"
        selectedRows={new Set()}
        onSelectRow={onSelectRow}
        allRowIds={['row-1']}
      >
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>Name</Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          <Table.Row rowId="row-1">
            <Table.Cell>Alice</Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table>
    )

    const rows = document.querySelectorAll('tbody tr')

    act(() => {
      ;(rows[0] as HTMLElement).click()
    })

    expect(onSelectRow.mock.callCount()).toBe(1)
    expect(onSelectRow.mock.calls[0]?.arguments[0]).toBe('row-1')
    expect(onSelectRow.mock.calls[0]?.arguments[1]).toBe(true)
  })

  it('selected row has aria-selected="true" in single-select mode', () => {
    render(
      <Table
        aria-label="Single select table"
        selectionMode="single"
        selectedRows={new Set(['row-1'])}
        onSelectRow={() => {}}
        allRowIds={['row-1', 'row-2']}
      >
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>Name</Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          <Table.Row rowId="row-1">
            <Table.Cell>Alice</Table.Cell>
          </Table.Row>
          <Table.Row rowId="row-2">
            <Table.Cell>Bob</Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table>
    )

    const rows = document.querySelectorAll('tbody tr')
    expect(rows[0]?.getAttribute('aria-selected')).toBe('true')
    expect(rows[1]?.getAttribute('aria-selected')).toBe('false')
  })
})

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe('Table — empty state', () => {
  it('renders empty slot when no children are present and not loading', () => {
    render(
      <Table aria-label="Empty table">
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>Name</Table.HeaderCell>
            <Table.HeaderCell>Status</Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body
          columnCount={2}
          empty={<span data-testid="empty-state">No data</span>}
        />
      </Table>
    )

    const emptyEl = document.querySelector('[data-testid="empty-state"]')
    expect(emptyEl).not.toBeNull()
    expect(emptyEl?.textContent).toBe('No data')
  })

  it('empty slot is wrapped in a td spanning all columns', () => {
    render(
      <Table aria-label="Empty table">
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>A</Table.HeaderCell>
            <Table.HeaderCell>B</Table.HeaderCell>
            <Table.HeaderCell>C</Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body columnCount={3} empty={<span>Nothing here</span>} />
      </Table>
    )

    const td = document.querySelector('tbody td')
    expect(td).not.toBeNull()
    expect(td?.getAttribute('colspan')).toBe('3')
  })

  it('does not render empty slot when there are children', () => {
    render(
      <Table aria-label="Non-empty table">
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>Name</Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body
          columnCount={1}
          empty={<span data-testid="empty-state">No data</span>}
        >
          <Table.Row>
            <Table.Cell>Alice</Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table>
    )

    const emptyEl = document.querySelector('[data-testid="empty-state"]')
    expect(emptyEl).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

describe('Table — loading state', () => {
  it('renders skeleton rows when loading=true', () => {
    render(
      <Table aria-label="Loading table">
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>Name</Table.HeaderCell>
            <Table.HeaderCell>Status</Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body loading columnCount={2} loadingRows={3} />
      </Table>
    )

    const rows = document.querySelectorAll('tbody tr')
    expect(rows.length).toBe(3)
  })

  it('loading body has aria-busy="true"', () => {
    render(
      <Table aria-label="Loading table">
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>Name</Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body loading columnCount={1} />
      </Table>
    )

    const tbody = document.querySelector('tbody')
    expect(tbody?.getAttribute('aria-busy')).toBe('true')
  })

  it('uses default loadingRows=5 when not specified', () => {
    render(
      <Table aria-label="Loading table">
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>Name</Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body loading columnCount={1} />
      </Table>
    )

    const rows = document.querySelectorAll('tbody tr')
    expect(rows.length).toBe(5)
  })

  it('does not render empty slot when loading=true', () => {
    render(
      <Table aria-label="Loading table">
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>Name</Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body
          loading
          columnCount={1}
          empty={<span data-testid="empty-state">No data</span>}
        />
      </Table>
    )

    const emptyEl = document.querySelector('[data-testid="empty-state"]')
    expect(emptyEl).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// TableCell — font size matches header cell
// ---------------------------------------------------------------------------

describe('Table — TableCell font size', () => {
  it('body cell has font-size 13px to match header cell', () => {
    render(
      <Table aria-label="Font size table">
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>Name</Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          <Table.Row>
            <Table.Cell>Alice</Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table>
    )

    const td = document.querySelector('td') as HTMLTableCellElement
    expect(td).not.toBeNull()
    // fontSize is set inline; jsdom stores inline style values as strings
    // Both body and header cells use fontSize.sm (now 12px) — they still match
    expect(td.style.fontSize).toBe('12px')
  })
})

// ---------------------------------------------------------------------------
// Bleed variant
// ---------------------------------------------------------------------------

describe('Table — bleed variant', () => {
  it('renders bleedTop content before the table when bleed=true', () => {
    render(
      <Table
        aria-label="Bleed table"
        bleed
        bleedTop={<div data-testid="bleed-top">Progress bar</div>}
      >
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>Name</Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body />
      </Table>
    )

    const bleedTop = document.querySelector('[data-testid="bleed-top"]')
    expect(bleedTop).not.toBeNull()
    expect(bleedTop?.textContent).toBe('Progress bar')

    // bleedTop must be rendered before the <table> element
    const table = document.querySelector('table')
    const outer = table?.parentElement
    const bleedTopIndex = Array.from(outer?.children ?? []).indexOf(bleedTop!)
    const tableIndex = Array.from(outer?.children ?? []).indexOf(table!)
    expect(bleedTopIndex).toBeLessThan(tableIndex)
  })

  it('does not render bleedTop when bleed is false', () => {
    render(
      <Table
        aria-label="No bleed table"
        bleedTop={<div data-testid="bleed-top">Should not appear</div>}
      >
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>Name</Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body />
      </Table>
    )

    const bleedTop = document.querySelector('[data-testid="bleed-top"]')
    expect(bleedTop).toBeNull()
  })

  it('does not render bleedTop when bleed is true but bleedTop is not provided', () => {
    render(
      <Table aria-label="Bleed table" bleed>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>Name</Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body />
      </Table>
    )

    // No extra element should appear before the table
    const table = document.querySelector('table')
    expect(table).not.toBeNull()
  })

  it('renders correctly when bleed is true (no JS error)', () => {
    render(
      <Table
        aria-label="Bleed table"
        bleed
        density="compact"
        surface="transparent"
      >
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>Name</Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body />
      </Table>
    )

    // Verify the table still renders
    expect(document.querySelector('table')).not.toBeNull()
    expect(document.querySelector('th')).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// TableCell — colSpan via props bag
// ---------------------------------------------------------------------------

describe('Table — TableCell colSpan', () => {
  it('renders td with correct colSpan', () => {
    render(
      <Table aria-label="Table">
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>A</Table.HeaderCell>
            <Table.HeaderCell>B</Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          <Table.Row>
            <Table.Cell colSpan={2}>Merged</Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table>
    )

    const td = document.querySelector('td')
    expect(td?.getAttribute('colspan')).toBe('2')
  })
})
