import * as assert from 'node:assert'
import { describe, it } from 'node:test'
import { noRawPalette } from '../rules/no-raw-palette'

interface MockReport {
  node: Record<string, unknown>
  messageId: string
  data?: Record<string, string>
}

function createMockContext(
  filename: string,
  options?: Record<string, unknown>
) {
  const reports: MockReport[] = []
  return {
    context: {
      id: '@repro/oxlint-plugin-design/no-raw-palette',
      filename,
      report: (diag: MockReport) => {
        reports.push(diag)
      },
      options: options ? [options] : [],
    },
    reports,
  }
}

describe('no-raw-palette', () => {
  it('reports colors.blue[700] in JSX when colors is imported', () => {
    const { context, reports } = createMockContext('/app/src/SomeComponent.tsx')
    const visitor = noRawPalette.create(context)

    // Import { colors } from '@repro/design'
    visitor.ImportDeclaration?.({
      type: 'ImportDeclaration',
      specifiers: [
        {
          type: 'ImportSpecifier',
          imported: { type: 'Identifier', name: 'colors' },
          local: { type: 'Identifier', name: 'colors' },
        },
      ],
      source: { type: 'Literal', value: '@repro/design' },
    })

    // colors.blue[700]
    visitor.MemberExpression?.({
      type: 'MemberExpression',
      object: { type: 'Identifier', name: 'colors' },
      property: { type: 'Literal', value: 700 },
    })

    assert.strictEqual(reports.length, 1)
    assert.strictEqual(reports[0]?.messageId, 'rawPalette')
  })

  it('reports colors.blue[700] when colors is imported with an alias', () => {
    const { context, reports } = createMockContext('/app/src/SomeComponent.tsx')
    const visitor = noRawPalette.create(context)

    // import { colors as palette } from '@repro/design'
    visitor.ImportDeclaration?.({
      type: 'ImportDeclaration',
      specifiers: [
        {
          type: 'ImportSpecifier',
          imported: { type: 'Identifier', name: 'colors' },
          local: { type: 'Identifier', name: 'palette' },
        },
      ],
      source: { type: 'Literal', value: '@repro/design' },
    })

    // palette.blue[700]
    visitor.MemberExpression?.({
      type: 'MemberExpression',
      object: { type: 'Identifier', name: 'palette' },
      property: { type: 'Literal', value: 700 },
    })

    assert.strictEqual(reports.length, 1)
    assert.strictEqual(reports[0]?.messageId, 'rawPalette')
  })

  it('does not report color.primary usage', () => {
    const { context, reports } = createMockContext('/app/src/SomeComponent.tsx')
    const visitor = noRawPalette.create(context)

    // Import { colors } from '@repro/design'
    visitor.ImportDeclaration?.({
      type: 'ImportDeclaration',
      specifiers: [
        {
          type: 'ImportSpecifier',
          imported: { type: 'Identifier', name: 'colors' },
          local: { type: 'Identifier', name: 'colors' },
        },
      ],
      source: { type: 'Literal', value: '@repro/design' },
    })

    // color.primary (not colors.*)
    visitor.MemberExpression?.({
      type: 'MemberExpression',
      object: { type: 'Identifier', name: 'color' },
      property: { type: 'Identifier', name: 'primary' },
    })

    assert.strictEqual(reports.length, 0)
  })

  it('does not report colors.blue[500] when colors is NOT imported', () => {
    const { context, reports } = createMockContext('/app/src/SomeComponent.tsx')
    const visitor = noRawPalette.create(context)

    // No ImportDeclaration for colors
    visitor.MemberExpression?.({
      type: 'MemberExpression',
      object: { type: 'Identifier', name: 'colors' },
      property: { type: 'Literal', value: 500 },
    })

    assert.strictEqual(reports.length, 0)
  })

  it('does not report for files under packages/design/src/', () => {
    const { context, reports } = createMockContext(
      '/app/src/packages/design/src/Button.tsx'
    )
    const visitor = noRawPalette.create(context)

    // Import { colors } from '@repro/design'
    visitor.ImportDeclaration?.({
      type: 'ImportDeclaration',
      specifiers: [
        {
          type: 'ImportSpecifier',
          imported: { type: 'Identifier', name: 'colors' },
          local: { type: 'Identifier', name: 'colors' },
        },
      ],
      source: { type: 'Literal', value: '@repro/design' },
    })

    // colors.blue[700]
    visitor.MemberExpression?.({
      type: 'MemberExpression',
      object: { type: 'Identifier', name: 'colors' },
      property: { type: 'Literal', value: 700 },
    })

    assert.strictEqual(reports.length, 0)
  })
})
