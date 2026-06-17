interface ReportData {
  node: Record<string, unknown>
  messageId: string
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

export const noClassnameProp: RuleModule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Forbid className prop on JSX elements. Use design-system components and tokens instead.',
    },
    messages: {
      noClassName:
        'className is not allowed on JSX elements. Use design-system components and tokens instead.',
    },
    schema: [],
  },
  create(context) {
    const filename = context.filename ?? ''
    if (EXCLUDED_PATH_PATTERN.test(filename)) {
      return {}
    }

    return {
      JSXAttribute(node: any) {
        if (!node.name || node.name.type !== 'JSXIdentifier') return
        if (node.name.name === 'className') {
          context.report({
            node,
            messageId: 'noClassName',
          })
        }
      },
    }
  },
}
