import { cleanup, render, screen } from '@testing-library/react'
import expect from 'expect'
import { afterEach, describe, it, mock } from 'node:test'
import React from 'react'
import { spacing } from '../tokens/spacing'

function MockBlock({
  children,
  component: Component = 'div',
  props,
}: {
  children?: React.ReactNode
  component?: React.ElementType
  props?: Record<string, unknown>
}) {
  return <Component {...props}>{children}</Component>
}

function MockRow({
  borderBottom,
  children,
  paddingH,
  props,
}: {
  borderBottom?: string
  children?: React.ReactNode
  paddingH?: number
  props?: Record<string, unknown>
}) {
  return (
    <div
      {...props}
      data-border-bottom={borderBottom ?? ''}
      data-padding-h={paddingH ?? ''}
    >
      {children}
    </div>
  )
}

mock.module('@jsxstyle/react', {
  namedExports: {
    Block: MockBlock,
    Col: MockBlock,
    Row: MockRow,
  },
})

afterEach(cleanup)

describe('Tabs.List layout', () => {
  it('keeps the horizontal border on the tablist while insetting tabs', async () => {
    const { Tabs } = await import('./index')

    render(
      <Tabs defaultValue="users">
        <Tabs.List aria-label="Sections">
          <Tabs.Tab value="users">Users</Tabs.Tab>
          <Tabs.Tab value="projects">Projects</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="users">Users panel</Tabs.Panel>
        <Tabs.Panel value="projects">Projects panel</Tabs.Panel>
      </Tabs>
    )

    const tablist = screen.getByRole('tablist', { name: 'Sections' })

    expect(tablist.getAttribute('data-border-bottom')).toContain('1px solid')
    expect(tablist.getAttribute('data-padding-h')).toBe(`${spacing.xl}`)
  })
})
