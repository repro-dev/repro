import type { Specificity } from '@repro/domain'

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

function parseSelectorTokens(selector: string): Array<{
  type: string
  value: string
  args?: string
}> {
  const tokens: Array<{ type: string; value: string; args?: string }> = []
  let i = 0

  while (i < selector.length) {
    const ch = selector[i]! // safe: i < selector.length

    // Whitespace (combinator)
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++
      continue
    }

    // Combinators
    if (ch === '>' || ch === '+' || ch === '~') {
      i++
      // skip following whitespace
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
          // Skip closing ')'
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
 * Compute specificity for a CSS selector.
 * Returns { a, b, c } where:
 *   a = number of ID selectors
 *   b = number of class selectors, attribute selectors, and pseudo-classes
 *   c = number of type selectors and pseudo-elements
 */
export function computeSpecificity(selectorText: string): Specificity {
  const trimmed = selectorText.trim()

  if (!trimmed || trimmed.length === 0) {
    return { a: 0, b: 0, c: 0 }
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
        // Handle :not(), :is(), :has(), :where()
        if (token.args !== undefined) {
          if (token.value === ':not') {
            // :not() counts specificity of its inner selector
            const inner = computeSpecificity(token.args)
            a += inner.a
            b += inner.b
            c += inner.c
          } else if (token.value === ':where') {
            // :where() contributes 0 specificity
            // skip
          } else if (token.value === ':is' || token.value === ':has') {
            // :is() and :has() take the most specific selector inside
            const innerSelectors = token.args.split(',').map(s => s.trim())
            let maxA = 0,
              maxB = 0,
              maxC = 0
            for (const innerSel of innerSelectors) {
              const sp = computeSpecificity(innerSel)
              if (
                sp.a > maxA ||
                (sp.a === maxA && sp.b > maxB) ||
                (sp.a === maxA && sp.b === maxB && sp.c > maxC)
              ) {
                maxA = sp.a
                maxB = sp.b
                maxC = sp.c
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
      // UNIVERSAL and COMBINATOR are ignored
    }
  }

  return { a, b, c }
}
