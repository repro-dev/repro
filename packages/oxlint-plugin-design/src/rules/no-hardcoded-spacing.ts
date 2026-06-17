interface ReportData {
  node: Record<string, unknown>
  messageId: string
  data?: Record<string, string>
}

interface RuleContext {
  id: string
  filename: string
  report: (diag: ReportData) => void
  options: unknown[]
}

interface RuleModule {
  meta: {
    type: 'problem' | 'suggestion' | 'layout'
    docs: { description: string }
    messages: Record<string, string>
    schema: Record<string, unknown>[]
  }
  create: (
    context: RuleContext
  ) => Record<string, ((node: any) => void) | undefined>
}

const SPACING_PROP_PATTERN = /^(padding|margin|gap)/

/**
 * Returns true if the literal value represents a raw spacing value
 * (number or numeric-looking string).
 */
function isRawSpacingValue(node: any): boolean {
  if (node.type !== 'Literal') return false

  const val = node.value
  if (typeof val === 'number') return true
  if (typeof val === 'string') {
    // Allow "0" and numeric strings like "16px"
    // A plain number string or a number + unit string counts as raw
    return /^\d+(\.\d+)?(px|em|rem|%)?$/.test(val)
  }
  return false
}

function isTokenUsage(node: any): boolean {
  if (node.type === 'MemberExpression' || node.type === 'Identifier') {
    return true
  }
  // TemplateLiteral with expressions (e.g., `${spacing.xl}px`) is token usage
  if (node.type === 'TemplateLiteral') {
    return node.expressions && node.expressions.length > 0
  }
  return false
}

export const noHardcodedSpacing: RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Forbid hardcoded spacing values in padding/margin/gap props. Use spacing.* tokens instead.',
    },
    messages: {
      hardcodedSpacing:
        "Hardcoded spacing value '{{value}}' in '{{prop}}'. Use a spacing.* token instead.",
    },
    schema: [],
  },
  create(context) {
    return {
      JSXAttribute(node: any) {
        if (!node.name || node.name.type !== 'JSXIdentifier') return
        const propName: string = node.name.name
        if (!SPACING_PROP_PATTERN.test(propName)) return

        if (!node.value) return

        // Handle direct string literal values (e.g., padding="16px")
        if (node.value.type === 'Literal') {
          const rawValue = String(node.value.value)
          context.report({
            node,
            messageId: 'hardcodedSpacing',
            data: { value: rawValue, prop: propName },
          })
          return
        }

        // Handle JSXExpressionContainer (e.g., padding={16})
        if (node.value.type === 'JSXExpressionContainer') {
          const expr = node.value.expression
          if (isTokenUsage(expr)) return

          if (isRawSpacingValue(expr)) {
            const rawValue = String(expr.value)
            context.report({
              node,
              messageId: 'hardcodedSpacing',
              data: { value: rawValue, prop: propName },
            })
          }
        }
      },
    }
  },
}
