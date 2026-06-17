import * as assert from 'node:assert'
import { describe, it } from 'node:test'
import { noClassnameProp } from '../rules/no-classname-prop'

interface MockReport {
  node: Record<string, unknown>
  messageId: string
}

function createMockContext(filename: string) {
  const reports: MockReport[] = []
  return {
    context: {
      id: '@repro/oxlint-plugin-design/no-classname-prop',
      filename,
      report: (diag: MockReport) => {
        reports.push(diag)
      },
      options: [],
    },
    reports,
  }
}

describe('no-classname-prop', () => {
  it('reports className on <div className="foo" />', () => {
    const { context, reports } = createMockContext('/app/src/SomeComponent.tsx')
    const visitor = noClassnameProp.create(context)
    visitor.JSXAttribute?.({
      type: 'JSXAttribute',
      name: { type: 'JSXIdentifier', name: 'className' },
      value: { type: 'Literal', value: 'foo' },
    })
    assert.strictEqual(reports.length, 1)
    assert.strictEqual(reports[0]?.messageId, 'noClassName')
  })

  it('reports className on <Button className="bar" />', () => {
    const { context, reports } = createMockContext('/app/src/SomeComponent.tsx')
    const visitor = noClassnameProp.create(context)
    visitor.JSXAttribute?.({
      type: 'JSXAttribute',
      name: { type: 'JSXIdentifier', name: 'className' },
      value: { type: 'Literal', value: 'bar' },
    })
    assert.strictEqual(reports.length, 1)
  })

  it('does not report when there is no className prop', () => {
    const { context, reports } = createMockContext('/app/src/SomeComponent.tsx')
    const visitor = noClassnameProp.create(context)
    visitor.JSXAttribute?.({
      type: 'JSXAttribute',
      name: { type: 'JSXIdentifier', name: 'onClick' },
      value: {
        type: 'JSXExpressionContainer',
        expression: { type: 'Identifier', name: 'handleClick' },
      },
    })
    assert.strictEqual(reports.length, 0)
  })

  it('reports className on <Block component="div" className="baz" />', () => {
    const { context, reports } = createMockContext('/app/src/SomeComponent.tsx')
    const visitor = noClassnameProp.create(context)
    visitor.JSXAttribute?.({
      type: 'JSXAttribute',
      name: { type: 'JSXIdentifier', name: 'className' },
      value: { type: 'Literal', value: 'baz' },
    })
    assert.strictEqual(reports.length, 1)
  })

  it('does not report for files under packages/design/src/', () => {
    const { context, reports } = createMockContext(
      '/app/src/packages/design/src/Button.tsx'
    )
    const visitor = noClassnameProp.create(context)
    visitor.JSXAttribute?.({
      type: 'JSXAttribute',
      name: { type: 'JSXIdentifier', name: 'className' },
      value: { type: 'Literal', value: 'custom' },
    })
    assert.strictEqual(reports.length, 0)
  })
})
