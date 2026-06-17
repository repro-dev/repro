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

const COLOR_PROP_PATTERN = /^(color|backgroundColor|borderColor|fill|stroke)$/
const HEX_PATTERN = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/
const RGB_PATTERN = /^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(,\s*[\d.]+%?\s*)?\)$/
const HSL_PATTERN =
  /^hsla?\(\s*\d+\s*,\s*[\d.]+%\s*,\s*[\d.]+%\s*(,\s*[\d.]+%?\s*)?\)$/
const NAMED_COLORS = new Set([
  'aliceblue',
  'antiquewhite',
  'aqua',
  'aquamarine',
  'azure',
  'beige',
  'bisque',
  'black',
  'blanchedalmond',
  'blue',
  'blueviolet',
  'brown',
  'burlywood',
  'cadetblue',
  'chartreuse',
  'chocolate',
  'coral',
  'cornflowerblue',
  'cornsilk',
  'crimson',
  'cyan',
  'darkblue',
  'darkcyan',
  'darkgoldenrod',
  'darkgray',
  'darkgreen',
  'darkgrey',
  'darkkhaki',
  'darkmagenta',
  'darkolivegreen',
  'darkorange',
  'darkorchid',
  'darkred',
  'darksalmon',
  'darkseagreen',
  'darkslateblue',
  'darkslategray',
  'darkslategrey',
  'darkturquoise',
  'darkviolet',
  'deeppink',
  'deepskyblue',
  'dimgray',
  'dimgrey',
  'dodgerblue',
  'firebrick',
  'floralwhite',
  'forestgreen',
  'fuchsia',
  'gainsboro',
  'ghostwhite',
  'gold',
  'goldenrod',
  'gray',
  'green',
  'greenyellow',
  'grey',
  'honeydew',
  'hotpink',
  'indianred',
  'indigo',
  'ivory',
  'khaki',
  'lavender',
  'lavenderblush',
  'lawngreen',
  'lemonchiffon',
  'lightblue',
  'lightcoral',
  'lightcyan',
  'lightgoldenrodyellow',
  'lightgray',
  'lightgreen',
  'lightgrey',
  'lightpink',
  'lightsalmon',
  'lightseagreen',
  'lightskyblue',
  'lightslategray',
  'lightslategrey',
  'lightsteelblue',
  'lightyellow',
  'lime',
  'limegreen',
  'linen',
  'magenta',
  'maroon',
  'mediumaquamarine',
  'mediumblue',
  'mediumorchid',
  'mediumpurple',
  'mediumseagreen',
  'mediumslateblue',
  'mediumspringgreen',
  'mediumturquoise',
  'mediumvioletred',
  'midnightblue',
  'mintcream',
  'mistyrose',
  'moccasin',
  'navajowhite',
  'navy',
  'oldlace',
  'olive',
  'olivedrab',
  'orange',
  'orangered',
  'orchid',
  'palegoldenrod',
  'palegreen',
  'paleturquoise',
  'palevioletred',
  'papayawhip',
  'peachpuff',
  'peru',
  'pink',
  'plum',
  'powderblue',
  'purple',
  'rebeccapurple',
  'red',
  'rosybrown',
  'royalblue',
  'saddlebrown',
  'salmon',
  'sandybrown',
  'seagreen',
  'seashell',
  'sienna',
  'silver',
  'skyblue',
  'slateblue',
  'slategray',
  'slategrey',
  'snow',
  'springgreen',
  'steelblue',
  'tan',
  'teal',
  'thistle',
  'tomato',
  'turquoise',
  'violet',
  'wheat',
  'white',
  'whitesmoke',
  'yellow',
  'yellowgreen',
])

function isHardcodedColor(value: string): boolean {
  if (HEX_PATTERN.test(value)) return true
  if (RGB_PATTERN.test(value)) return true
  if (HSL_PATTERN.test(value)) return true
  if (NAMED_COLORS.has(value)) return true
  return false
}

function getStringValue(node: any): string | undefined {
  if (node.type === 'Literal') {
    return String(node.value)
  }
  if (
    node.type === 'TemplateLiteral' &&
    node.quasis &&
    node.quasis.length > 0
  ) {
    const quasi = node.quasis[0]
    if (quasi && quasi.value && typeof quasi.value.cooked === 'string') {
      return quasi.value.cooked
    }
    if (quasi && quasi.value && typeof quasi.value.raw === 'string') {
      return quasi.value.raw
    }
  }
  return undefined
}

function isTokenUsage(node: any): boolean {
  if (node.type === 'MemberExpression' || node.type === 'Identifier') {
    return true
  }
  if (node.type === 'TemplateLiteral') {
    return node.expressions && node.expressions.length > 0
  }
  return false
}

export const noHardcodedColor: RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Forbid hardcoded color values in JSX attributes. Use color.* tokens instead.',
    },
    messages: {
      hardcodedColor:
        "Hardcoded color '{{value}}' in '{{prop}}'. Use a color.* token instead.",
    },
    schema: [],
  },
  create(context) {
    return {
      JSXAttribute(node: any) {
        if (!node.name || node.name.type !== 'JSXIdentifier') return
        const propName: string = node.name.name
        if (!COLOR_PROP_PATTERN.test(propName)) return

        if (!node.value) return

        // Handle direct literal values (e.g., color="#fff")
        if (node.value.type === 'Literal') {
          const rawValue = String(node.value.value)
          if (isHardcodedColor(rawValue)) {
            context.report({
              node,
              messageId: 'hardcodedColor',
              data: { value: rawValue, prop: propName },
            })
          }
          return
        }

        // Handle JSXExpressionContainer (e.g., color={color.primary})
        if (node.value.type === 'JSXExpressionContainer') {
          const expr = node.value.expression
          if (isTokenUsage(expr)) return

          const stringValue = getStringValue(expr)
          if (stringValue !== undefined && isHardcodedColor(stringValue)) {
            context.report({
              node,
              messageId: 'hardcodedColor',
              data: { value: stringValue, prop: propName },
            })
          }
        }
      },
    }
  },
}
