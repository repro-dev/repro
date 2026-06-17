import * as assert from 'node:assert'
import { describe, it } from 'node:test'
import { noHardcodedColor } from '../rules/no-hardcoded-color'

interface MockReport {
  node: Record<string, unknown>
  messageId: string
  data?: Record<string, string>
}

function createMockContext(options?: Record<string, unknown>) {
  const reports: MockReport[] = []
  return {
    context: {
      id: '@repro/oxlint-plugin-design/no-hardcoded-color',
      filename: '/app/src/SomeComponent.tsx',
      report: (diag: MockReport) => {
        reports.push(diag)
      },
      options: options ? [options] : [],
    },
    reports,
  }
}

describe('no-hardcoded-color', () => {
  it('reports hex 3-digit color (#fff)', () => {
    const { context, reports } = createMockContext()
    const visitor = noHardcodedColor.create(context)
    visitor.JSXAttribute?.({
      type: 'JSXAttribute',
      name: { type: 'JSXIdentifier', name: 'color' },
      value: { type: 'Literal', value: '#fff' },
    })
    assert.strictEqual(reports.length, 1)
    assert.strictEqual(reports[0]?.messageId, 'hardcodedColor')
  })

  it('reports hex 6-digit color (#ffffff)', () => {
    const { context, reports } = createMockContext()
    const visitor = noHardcodedColor.create(context)
    visitor.JSXAttribute?.({
      type: 'JSXAttribute',
      name: { type: 'JSXIdentifier', name: 'color' },
      value: { type: 'Literal', value: '#ffffff' },
    })
    assert.strictEqual(reports.length, 1)
  })

  it('reports rgb() color', () => {
    const { context, reports } = createMockContext()
    const visitor = noHardcodedColor.create(context)
    visitor.JSXAttribute?.({
      type: 'JSXAttribute',
      name: { type: 'JSXIdentifier', name: 'color' },
      value: { type: 'Literal', value: 'rgb(255, 0, 0)' },
    })
    assert.strictEqual(reports.length, 1)
  })

  it('reports rgba() color', () => {
    const { context, reports } = createMockContext()
    const visitor = noHardcodedColor.create(context)
    visitor.JSXAttribute?.({
      type: 'JSXAttribute',
      name: { type: 'JSXIdentifier', name: 'color' },
      value: { type: 'Literal', value: 'rgba(255, 0, 0, 0.5)' },
    })
    assert.strictEqual(reports.length, 1)
  })

  it('reports hsl() color', () => {
    const { context, reports } = createMockContext()
    const visitor = noHardcodedColor.create(context)
    visitor.JSXAttribute?.({
      type: 'JSXAttribute',
      name: { type: 'JSXIdentifier', name: 'color' },
      value: { type: 'Literal', value: 'hsl(240, 100%, 50%)' },
    })
    assert.strictEqual(reports.length, 1)
  })

  it('reports hsla() color', () => {
    const { context, reports } = createMockContext()
    const visitor = noHardcodedColor.create(context)
    visitor.JSXAttribute?.({
      type: 'JSXAttribute',
      name: { type: 'JSXIdentifier', name: 'color' },
      value: { type: 'Literal', value: 'hsla(240, 100%, 50%, 0.5)' },
    })
    assert.strictEqual(reports.length, 1)
  })

  it('reports named color white', () => {
    const { context, reports } = createMockContext()
    const visitor = noHardcodedColor.create(context)
    visitor.JSXAttribute?.({
      type: 'JSXAttribute',
      name: { type: 'JSXIdentifier', name: 'backgroundColor' },
      value: { type: 'Literal', value: 'white' },
    })
    assert.strictEqual(reports.length, 1)
  })

  it('reports named color black', () => {
    const { context, reports } = createMockContext()
    const visitor = noHardcodedColor.create(context)
    visitor.JSXAttribute?.({
      type: 'JSXAttribute',
      name: { type: 'JSXIdentifier', name: 'borderColor' },
      value: { type: 'Literal', value: 'black' },
    })
    assert.strictEqual(reports.length, 1)
  })

  it('reports named color red', () => {
    const { context, reports } = createMockContext()
    const visitor = noHardcodedColor.create(context)
    visitor.JSXAttribute?.({
      type: 'JSXAttribute',
      name: { type: 'JSXIdentifier', name: 'color' },
      value: { type: 'Literal', value: 'red' },
    })
    assert.strictEqual(reports.length, 1)
  })

  it('reports named color rebeccapurple', () => {
    const { context, reports } = createMockContext()
    const visitor = noHardcodedColor.create(context)
    visitor.JSXAttribute?.({
      type: 'JSXAttribute',
      name: { type: 'JSXIdentifier', name: 'color' },
      value: { type: 'Literal', value: 'rebeccapurple' },
    })
    assert.strictEqual(reports.length, 1)
  })

  it('does not report transparent as a named color', () => {
    const { context, reports } = createMockContext()
    const visitor = noHardcodedColor.create(context)
    visitor.JSXAttribute?.({
      type: 'JSXAttribute',
      name: { type: 'JSXIdentifier', name: 'backgroundColor' },
      value: { type: 'Literal', value: 'transparent' },
    })
    assert.strictEqual(reports.length, 0)
  })

  it('does not report token usage color={color.primary}', () => {
    const { context, reports } = createMockContext()
    const visitor = noHardcodedColor.create(context)
    visitor.JSXAttribute?.({
      type: 'JSXAttribute',
      name: { type: 'JSXIdentifier', name: 'color' },
      value: {
        type: 'JSXExpressionContainer',
        expression: {
          type: 'MemberExpression',
          object: { type: 'Identifier', name: 'color' },
          property: { type: 'Identifier', name: 'primary' },
        },
      },
    })
    assert.strictEqual(reports.length, 0)
  })

  it('does not report color={someVariable}', () => {
    const { context, reports } = createMockContext()
    const visitor = noHardcodedColor.create(context)
    visitor.JSXAttribute?.({
      type: 'JSXAttribute',
      name: { type: 'JSXIdentifier', name: 'color' },
      value: {
        type: 'JSXExpressionContainer',
        expression: { type: 'Identifier', name: 'someVariable' },
      },
    })
    assert.strictEqual(reports.length, 0)
  })

  it('reports fill="#333"', () => {
    const { context, reports } = createMockContext()
    const visitor = noHardcodedColor.create(context)
    visitor.JSXAttribute?.({
      type: 'JSXAttribute',
      name: { type: 'JSXIdentifier', name: 'fill' },
      value: { type: 'Literal', value: '#333' },
    })
    assert.strictEqual(reports.length, 1)
  })

  it('reports stroke="#333"', () => {
    const { context, reports } = createMockContext()
    const visitor = noHardcodedColor.create(context)
    visitor.JSXAttribute?.({
      type: 'JSXAttribute',
      name: { type: 'JSXIdentifier', name: 'stroke' },
      value: { type: 'Literal', value: '#333' },
    })
    assert.strictEqual(reports.length, 1)
  })

  it('reports 3-digit hex (#f00)', () => {
    const { context, reports } = createMockContext()
    const visitor = noHardcodedColor.create(context)
    visitor.JSXAttribute?.({
      type: 'JSXAttribute',
      name: { type: 'JSXIdentifier', name: 'color' },
      value: { type: 'Literal', value: '#f00' },
    })
    assert.strictEqual(reports.length, 1)
  })

  it('reports 8-digit hex (#f0f0f0f0)', () => {
    const { context, reports } = createMockContext()
    const visitor = noHardcodedColor.create(context)
    visitor.JSXAttribute?.({
      type: 'JSXAttribute',
      name: { type: 'JSXIdentifier', name: 'color' },
      value: { type: 'Literal', value: '#f0f0f0f0' },
    })
    assert.strictEqual(reports.length, 1)
  })

  it('does not report non-color prop (name="John")', () => {
    const { context, reports } = createMockContext()
    const visitor = noHardcodedColor.create(context)
    visitor.JSXAttribute?.({
      type: 'JSXAttribute',
      name: { type: 'JSXIdentifier', name: 'name' },
      value: { type: 'Literal', value: 'John' },
    })
    assert.strictEqual(reports.length, 0)
  })

  it('reports template literal color={`#fff`}', () => {
    const { context, reports } = createMockContext()
    const visitor = noHardcodedColor.create(context)
    visitor.JSXAttribute?.({
      type: 'JSXAttribute',
      name: { type: 'JSXIdentifier', name: 'color' },
      value: {
        type: 'JSXExpressionContainer',
        expression: {
          type: 'TemplateLiteral',
          quasis: [
            {
              type: 'TemplateElement',
              value: { raw: '#fff', cooked: '#fff' },
              tail: true,
            },
          ],
        },
      },
    })
    assert.strictEqual(reports.length, 1)
  })
})
