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

const EXCLUDED_PATH_PATTERN = /packages\/design\/src\//

export const noRawPalette: RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Forbid direct use of the raw Tailwind palette (colors.*). Use color.* tokens instead.',
    },
    messages: {
      rawPalette:
        "Using 'colors.{{name}}' directly. Use a color.* token instead.",
    },
    schema: [],
  },
  create(context) {
    const filename = context.filename ?? ''
    if (EXCLUDED_PATH_PATTERN.test(filename)) {
      return {}
    }

    let hasColorsImport = false

    return {
      ImportDeclaration(node: any) {
        if (
          node.source &&
          node.source.value === '@repro/design' &&
          node.specifiers
        ) {
          for (const specifier of node.specifiers) {
            if (
              specifier.type === 'ImportSpecifier' &&
              specifier.imported &&
              specifier.imported.name === 'colors'
            ) {
              hasColorsImport = true
              return
            }
          }
        }
      },
      MemberExpression(node: any) {
        if (!hasColorsImport) return

        if (
          node.object &&
          node.object.type === 'Identifier' &&
          node.object.name === 'colors'
        ) {
          const propertyName = getPropertyName(node.property)
          context.report({
            node,
            messageId: 'rawPalette',
            data: { name: propertyName },
          })
        }
      },
    }
  },
}

function getPropertyName(property: any): string {
  if (!property) return 'unknown'
  if (property.type === 'Identifier') return property.name
  if (property.type === 'Literal') return String(property.value)
  return 'unknown'
}
