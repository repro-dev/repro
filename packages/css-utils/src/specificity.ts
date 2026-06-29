import { colors } from '@repro/design'

// CSS selector token types for specificity counting
const TOKEN = {
  ID: '#' as const,
  CLASS: '.' as const,
  ATTRIBUTE: '[' as const,
  PSEUDO_CLASS: ':' as const,
  PSEUDO_ELEMENT: '::' as const,
  TYPE: 'type' as const,
  UNIVERSAL: '*' as const,
  COMBINATOR: 'combinator' as const,
  WHITESPACE: ' ' as const,
  COMMA: ',' as const,
  FUNCTION: 'fn' as const,
}

/* eslint-disable @repro/oxlint-plugin-design/no-raw-palette */
const TOKEN_COLORS: Record<string, string | undefined> = {
  [TOKEN.TYPE]: colors.violet[600],
  [TOKEN.CLASS]: colors.blue[600],
  [TOKEN.ID]: colors.amber[600],
  [TOKEN.PSEUDO_CLASS]: colors.emerald[600],
  [TOKEN.PSEUDO_ELEMENT]: colors.teal[600],
  [TOKEN.ATTRIBUTE]: colors.amber[700],
  [TOKEN.COMBINATOR]: colors.slate[400],
  [TOKEN.UNIVERSAL]: colors.slate[400],
  [TOKEN.FUNCTION]: colors.emerald[600],
}
/* eslint-enable @repro/oxlint-plugin-design/no-raw-palette */

export function getTokenColor(type: string): string | undefined {
  return TOKEN_COLORS[type]
}

export type SelectorToken = {
  type: string
  value: string
  args?: string
}

/**
 * Tokenize a CSS selector string for display purposes.
 * Unlike parseSelectorTokens (used for specificity calculation), this emits
 * all token types including whitespace, combinators, and commas.
 *
 * - Whitespace: consecutive whitespace chars are collapsed into a single
 *   `{ type: TOKEN.WHITESPACE, value: ' ' }` token.
 * - Combinators: emitted as `{ type: TOKEN.COMBINATOR, value: ch }`.
 * - Commas: emitted as `{ type: TOKEN.COMMA, value: ',' }`.
 */
export function tokenizeSelector(selector: string): SelectorToken[] {
  // Whitespace-only or empty selectors produce no tokens
  if (!selector.trim()) {
    return []
  }

  const tokens: SelectorToken[] = []
  let i = 0

  while (i < selector.length) {
    const ch = selector[i]!

    // Whitespace — collapse consecutive whitespace
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      tokens.push({ type: TOKEN.WHITESPACE, value: ' ' })
      i++
      while (i < selector.length && /[\s]/.test(selector[i]!)) {
        i++
      }
      continue
    }

    // Combinators
    if (ch === '>' || ch === '+' || ch === '~') {
      tokens.push({ type: TOKEN.COMBINATOR, value: ch })
      i++
      continue
    }

    // Comma
    if (ch === ',') {
      tokens.push({ type: TOKEN.COMMA, value: ',' })
      i++
      continue
    }

    // ID selector
    if (ch === '#') {
      let value = '#'
      i++
      while (i < selector.length && /[\w-]/.test(selector[i]!)) {
        value += selector[i]!
        i++
      }
      tokens.push({ type: TOKEN.ID, value })
      continue
    }

    // Class selector
    if (ch === '.') {
      let value = '.'
      i++
      while (i < selector.length && /[\w-]/.test(selector[i]!)) {
        value += selector[i]!
        i++
      }
      tokens.push({ type: TOKEN.CLASS, value })
      continue
    }

    // Escaped character sequence
    if (ch === '\\') {
      i++
      if (i < selector.length) {
        if (selector[i] === '\\') {
          i++
        } else {
          let value = ''
          while (i < selector.length && /[\w-]/.test(selector[i]!)) {
            value += selector[i]!
            i++
          }
        }
      }
      continue
    }

    // Attribute selector
    if (ch === '[') {
      let value = '['
      i++
      let depth = 1
      while (i < selector.length && depth > 0) {
        if (selector[i] === '[') depth++
        if (selector[i] === ']') depth--
        value += selector[i]!
        i++
      }
      tokens.push({ type: TOKEN.ATTRIBUTE, value })
      continue
    }

    // Pseudo-element or pseudo-class
    if (ch === ':') {
      i++
      if (i < selector.length && selector[i] === ':') {
        // ::pseudo-element
        i++
        let value = '::'
        while (i < selector.length && /[\w-]/.test(selector[i]!)) {
          value += selector[i]!
          i++
        }
        tokens.push({ type: TOKEN.PSEUDO_ELEMENT, value })
      } else {
        // :pseudo-class or :pseudo-class(args)
        let value = ':'
        while (i < selector.length && /[\w-]/.test(selector[i]!)) {
          value += selector[i]!
          i++
        }

        // Check for functional pseudo-class with arguments
        if (i < selector.length && selector[i] === '(') {
          const fnName = value
          let args = ''
          i++ // skip '('
          let depth = 1
          while (i < selector.length && depth > 0) {
            if (selector[i] === '(') depth++
            if (selector[i] === ')') depth--
            if (depth > 0) args += selector[i]!
            i++
          }
          tokens.push({
            type: TOKEN.FUNCTION,
            value: fnName,
            args,
          })
        } else {
          tokens.push({ type: TOKEN.PSEUDO_CLASS, value })
        }
      }
      continue
    }

    // Universal selector
    if (ch === '*') {
      i++
      tokens.push({ type: TOKEN.UNIVERSAL, value: '*' })
      continue
    }

    // Type selector (tag name)
    if (/[a-zA-Z]/.test(ch)) {
      let value = ''
      while (i < selector.length && /[\w-]/.test(selector[i]!)) {
        value += selector[i]!
        i++
      }
      tokens.push({ type: TOKEN.TYPE, value })
      continue
    }

    // Unknown character, skip
    i++
  }

  return tokens
}

function parseSelectorTokens(selector: string): Array<{
  type: string
  value: string
  args?: string
}> {
  const tokens: Array<{ type: string; value: string; args?: string }> = []
  let i = 0

  while (i < selector.length) {
    const ch = selector[i]!

    // Whitespace (combinator)
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++
      continue
    }

    // Combinators
    if (ch === '>' || ch === '+' || ch === '~') {
      i++
      while (i < selector.length && selector[i] === ' ') i++
      continue
    }

    // ID selector
    if (ch === '#') {
      let value = '#'
      i++
      while (i < selector.length && /[\w-]/.test(selector[i]!)) {
        value += selector[i]!
        i++
      }
      tokens.push({ type: TOKEN.ID, value })
      continue
    }

    // Class selector
    if (ch === '.') {
      let value = '.'
      i++
      while (i < selector.length && /[\w-]/.test(selector[i]!)) {
        value += selector[i]!
        i++
      }
      tokens.push({ type: TOKEN.CLASS, value })
      continue
    }

    // Escaped character sequence
    if (ch === '\\') {
      // Skip the backslash and the escaped char (or Unicode sequence)
      i++
      if (i < selector.length) {
        if (selector[i] === '\\') {
          // Double escape, just skip both
          i++
        } else {
          // Read the escaped identifier
          let value = ''
          while (i < selector.length && /[\w-]/.test(selector[i]!)) {
            value += selector[i]!
            i++
          }
        }
      }
      continue
    }

    // Attribute selector
    if (ch === '[') {
      let value = '['
      i++
      let depth = 1
      while (i < selector.length && depth > 0) {
        if (selector[i] === '[') depth++
        if (selector[i] === ']') depth--
        value += selector[i]!
        i++
      }
      tokens.push({ type: TOKEN.ATTRIBUTE, value })
      continue
    }

    // Pseudo-element or pseudo-class
    if (ch === ':') {
      i++
      if (i < selector.length && selector[i] === ':') {
        // ::pseudo-element
        i++
        let value = '::'
        while (i < selector.length && /[\w-]/.test(selector[i]!)) {
          value += selector[i]!
          i++
        }
        tokens.push({ type: TOKEN.PSEUDO_ELEMENT, value })
      } else {
        // :pseudo-class or :pseudo-class(args)
        let value = ':'
        while (i < selector.length && /[\w-]/.test(selector[i]!)) {
          value += selector[i]!
          i++
        }

        // Check for functional pseudo-class with arguments
        if (i < selector.length && selector[i] === '(') {
          const fnName = value
          let args = ''
          i++ // skip '('
          let depth = 1
          while (i < selector.length && depth > 0) {
            if (selector[i] === '(') depth++
            if (selector[i] === ')') depth--
            if (depth > 0) args += selector[i]!
            i++
          }
          tokens.push({
            type: TOKEN.FUNCTION,
            value: fnName,
            args,
          })
        } else {
          tokens.push({ type: TOKEN.PSEUDO_CLASS, value })
        }
      }
      continue
    }

    // Universal selector
    if (ch === '*') {
      i++
      tokens.push({ type: TOKEN.UNIVERSAL, value: '*' })
      continue
    }

    // Comma (separator)
    if (ch === ',') {
      i++
      continue
    }

    // Type selector (tag name)
    if (/[a-zA-Z]/.test(ch)) {
      let value = ''
      while (i < selector.length && /[\w-]/.test(selector[i]!)) {
        value += selector[i]!
        i++
      }
      tokens.push({ type: TOKEN.TYPE, value })
      continue
    }

    // Unknown character, skip
    i++
  }

  return tokens
}

/**
 * Compare two specificity tuples lexicographically.
 * Returns -1 if a < b, 0 if equal, 1 if a > b.
 */
export function compareSpecificity(
  a: [number, number, number],
  b: [number, number, number]
): -1 | 0 | 1 {
  if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1
  if (a[1] !== b[1]) return a[1] < b[1] ? -1 : 1
  if (a[2] !== b[2]) return a[2] < b[2] ? -1 : 1
  return 0
}

/**
 * Compute specificity for a CSS selector.
 * Returns [a, b, c] where:
 *   a = number of ID selectors
 *   b = number of class selectors, attribute selectors, and pseudo-classes
 *   c = number of type selectors and pseudo-elements
 */
export function computeSpecificity(
  selectorText: string
): [number, number, number] {
  const trimmed = selectorText.trim()

  if (!trimmed || trimmed.length === 0) {
    return [0, 0, 0]
  }

  const tokens = parseSelectorTokens(trimmed)
  let a = 0
  let b = 0
  let c = 0

  for (let idx = 0; idx < tokens.length; idx++) {
    const token = tokens[idx]!

    switch (token.type) {
      case TOKEN.ID:
        a++
        break
      case TOKEN.CLASS:
      case TOKEN.ATTRIBUTE:
        b++
        break
      case TOKEN.PSEUDO_CLASS:
        b++
        break
      case TOKEN.PSEUDO_ELEMENT:
        c++
        break
      case TOKEN.TYPE:
        c++
        break
      case TOKEN.FUNCTION: {
        if (token.args !== undefined) {
          if (token.value === ':not') {
            const [ia, ib, ic] = computeSpecificity(token.args)
            a += ia
            b += ib
            c += ic
          } else if (token.value === ':where') {
            // :where() contributes 0 specificity
          } else if (token.value === ':is' || token.value === ':has') {
            const innerSelectors = token.args.split(',').map(s => s.trim())
            let maxA = 0,
              maxB = 0,
              maxC = 0
            for (const innerSel of innerSelectors) {
              const sp = computeSpecificity(innerSel)
              if (
                sp[0] > maxA ||
                (sp[0] === maxA && sp[1] > maxB) ||
                (sp[0] === maxA && sp[1] === maxB && sp[2] > maxC)
              ) {
                maxA = sp[0]
                maxB = sp[1]
                maxC = sp[2]
              }
            }
            a += maxA
            b += maxB
            c += maxC
          } else {
            // Other functional pseudo-classes like :nth-child(2)
            b++
          }
        }
        break
      }
    }
  }

  return [a, b, c]
}
