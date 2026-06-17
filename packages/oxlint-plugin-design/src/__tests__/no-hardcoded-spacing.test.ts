import * as assert from 'node:assert'
import { describe, it } from 'node:test'
import { noHardcodedSpacing } from '../rules/no-hardcoded-spacing'

interface MockReport {
  node: Record<string, unknown>
  messageId: string
  data?: Record<string, string>
}

function createMockContext(options?: Record<string, unknown>) {
  const reports: MockReport[] = []
  return {
    context: {
      id: '@repro/oxlint-plugin-design/no-hardcoded-spacing',
      filename: '/app/src/SomeComponent.tsx',
      report: (diag: MockReport) => {
        reports.push(diag)
      },
      options: options ? [options] : [],
    },
    reports,
  }
}

describe('no-hardcoded-spacing', () => {
  it('reports padding={16}', () => {
    const { context, reports } = createMockContext()
    const visitor = noHardcodedSpacing.create(context)
    visitor.JSXAttribute?.({
      type: 'JSXAttribute',
      name: { type: 'JSXIdentifier', name: 'padding' },
      value: {
        type: 'JSXExpressionContainer',
        expression: { type: 'Literal', value: 16 },
      },
    })
    assert.strictEqual(reports.length, 1)
    assert.strictEqual(reports[0]?.messageId, 'hardcodedSpacing')
  })

  it('reports margin={8}', () => {
    const { context, reports } = createMockContext()
    const visitor = noHardcodedSpacing.create(context)
    visitor.JSXAttribute?.({
      type: 'JSXAttribute',
      name: { type: 'JSXIdentifier', name: 'margin' },
      value: {
        type: 'JSXExpressionContainer',
        expression: { type: 'Literal', value: 8 },
      },
    })
    assert.strictEqual(reports.length, 1)
  })

  it('reports gap={4}', () => {
    const { context, reports } = createMockContext()
    const visitor = noHardcodedSpacing.create(context)
    visitor.JSXAttribute?.({
      type: 'JSXAttribute',
      name: { type: 'JSXIdentifier', name: 'gap' },
      value: {
        type: 'JSXExpressionContainer',
        expression: { type: 'Literal', value: 4 },
      },
    })
    assert.strictEqual(reports.length, 1)
  })

  it('does not report padding={spacing.xl}', () => {
    const { context, reports } = createMockContext()
    const visitor = noHardcodedSpacing.create(context)
    visitor.JSXAttribute?.({
      type: 'JSXAttribute',
      name: { type: 'JSXIdentifier', name: 'padding' },
      value: {
        type: 'JSXExpressionContainer',
        expression: {
          type: 'MemberExpression',
          object: { type: 'Identifier', name: 'spacing' },
          property: { type: 'Identifier', name: 'xl' },
        },
      },
    })
    assert.strictEqual(reports.length, 0)
  })

  it('does not report margin={someVar}', () => {
    const { context, reports } = createMockContext()
    const visitor = noHardcodedSpacing.create(context)
    visitor.JSXAttribute?.({
      type: 'JSXAttribute',
      name: { type: 'JSXIdentifier', name: 'margin' },
      value: {
        type: 'JSXExpressionContainer',
        expression: { type: 'Identifier', name: 'someVar' },
      },
    })
    assert.strictEqual(reports.length, 0)
  })

  it('reports padding="16px" (string)', () => {
    const { context, reports } = createMockContext()
    const visitor = noHardcodedSpacing.create(context)
    visitor.JSXAttribute?.({
      type: 'JSXAttribute',
      name: { type: 'JSXIdentifier', name: 'padding' },
      value: { type: 'Literal', value: '16px' },
    })
    assert.strictEqual(reports.length, 1)
  })

  it('reports padding={0}', () => {
    const { context, reports } = createMockContext()
    const visitor = noHardcodedSpacing.create(context)
    visitor.JSXAttribute?.({
      type: 'JSXAttribute',
      name: { type: 'JSXIdentifier', name: 'padding' },
      value: {
        type: 'JSXExpressionContainer',
        expression: { type: 'Literal', value: 0 },
      },
    })
    assert.strictEqual(reports.length, 1)
  })

  it('does not report fontSize={16} (non-spacing prop)', () => {
    const { context, reports } = createMockContext()
    const visitor = noHardcodedSpacing.create(context)
    visitor.JSXAttribute?.({
      type: 'JSXAttribute',
      name: { type: 'JSXIdentifier', name: 'fontSize' },
      value: {
        type: 'JSXExpressionContainer',
        expression: { type: 'Literal', value: 16 },
      },
    })
    assert.strictEqual(reports.length, 0)
  })

  it('does not report template literal with identifier (`${spacing.xl}px`)', () => {
    const { context, reports } = createMockContext()
    const visitor = noHardcodedSpacing.create(context)
    visitor.JSXAttribute?.({
      type: 'JSXAttribute',
      name: { type: 'JSXIdentifier', name: 'padding' },
      value: {
        type: 'JSXExpressionContainer',
        expression: {
          type: 'TemplateLiteral',
          quasis: [
            {
              type: 'TemplateElement',
              value: { raw: '', cooked: '' },
              tail: false,
            },
            {
              type: 'TemplateElement',
              value: { raw: 'px', cooked: 'px' },
              tail: true,
            },
          ],
          expressions: [
            {
              type: 'MemberExpression',
              object: { type: 'Identifier', name: 'spacing' },
              property: { type: 'Identifier', name: 'xl' },
            },
          ],
        },
      },
    })
    assert.strictEqual(reports.length, 0)
  })
})
