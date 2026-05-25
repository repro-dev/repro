import { cleanup, render } from '@testing-library/react'
import expect from 'expect'
import { afterEach, describe, it } from 'node:test'
import React from 'react'
import { spacing } from '../tokens/spacing'
import { Table } from './index'

afterEach(cleanup)

function renderDensityTable(density?: 'default' | 'compact') {
  render(
    <Table aria-label="Density table" density={density}>
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

  const th = document.querySelector('th') as HTMLTableCellElement
  const td = document.querySelector('td') as HTMLTableCellElement

  expect(th).not.toBeNull()
  expect(td).not.toBeNull()

  return { th, td }
}

describe('Table — density spacing', () => {
  it('preserves default body and header cell spacing', () => {
    const { th, td } = renderDensityTable()

    expect(th.style.paddingTop).toBe(`${spacing.lg}px`)
    expect(th.style.paddingBottom).toBe(`${spacing.lg}px`)
    expect(th.style.paddingLeft).toBe(`${spacing.xl}px`)
    expect(th.style.paddingRight).toBe(`${spacing.xl}px`)
    expect(td.style.paddingTop).toBe(`${spacing.lg}px`)
    expect(td.style.paddingBottom).toBe(`${spacing.lg}px`)
    expect(td.style.paddingLeft).toBe(`${spacing.xl}px`)
    expect(td.style.paddingRight).toBe(`${spacing.xl}px`)
  })

  it('applies compact body and header cell spacing', () => {
    const { th, td } = renderDensityTable('compact')

    expect(th.style.paddingTop).toBe(`${spacing.md}px`)
    expect(th.style.paddingBottom).toBe(`${spacing.md}px`)
    expect(th.style.paddingLeft).toBe(`${spacing.lg}px`)
    expect(th.style.paddingRight).toBe(`${spacing.lg}px`)
    expect(td.style.paddingTop).toBe(`${spacing.md}px`)
    expect(td.style.paddingBottom).toBe(`${spacing.md}px`)
    expect(td.style.paddingLeft).toBe(`${spacing.lg}px`)
    expect(td.style.paddingRight).toBe(`${spacing.lg}px`)
  })
})
