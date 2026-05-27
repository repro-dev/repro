import { cleanup, fireEvent, render } from '@testing-library/react'
import expect from 'expect'
import { afterEach, describe, it } from 'node:test'
import React from 'react'
import { color } from '../tokens/colors'
import { Table } from './index'

afterEach(cleanup)

function cssColor(value: string) {
  const element = document.createElement('span')
  element.style.color = value
  return element.style.color
}

describe('Table — surface', () => {
  it('renders a transparent table surface when requested', () => {
    render(
      <Table aria-label="Transparent table" surface="transparent">
        <Table.Body>
          <Table.Row>
            <Table.Cell>Alice</Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table>
    )

    const table = document.querySelector('table') as HTMLTableElement
    expect(table.style.backgroundColor).toBe('transparent')
  })

  it('tints selectable transparent body rows on hover', () => {
    render(
      <Table
        aria-label="Transparent selectable table"
        surface="transparent"
        selectionMode="single"
        allRowIds={['row-1']}
        onSelectRow={() => {}}
      >
        <Table.Body>
          <Table.Row rowId="row-1">
            <Table.Cell>Alice</Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table>
    )

    const row = document.querySelector('tbody tr') as HTMLTableRowElement
    expect(row.style.backgroundColor).toBe('')

    fireEvent.mouseEnter(row)

    expect(row.style.backgroundColor).toBe(cssColor(color.bg.hover))
  })

  it('keeps selected row background above transparent hover tint', () => {
    render(
      <Table
        aria-label="Transparent selected table"
        surface="transparent"
        selectionMode="single"
        selectedRows={new Set(['row-1'])}
        allRowIds={['row-1']}
        onSelectRow={() => {}}
      >
        <Table.Body>
          <Table.Row rowId="row-1">
            <Table.Cell>Alice</Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table>
    )

    const row = document.querySelector('tbody tr') as HTMLTableRowElement

    fireEvent.mouseEnter(row)

    expect(row.style.backgroundColor).toBe(cssColor(color.primarySubtle))
  })
})
