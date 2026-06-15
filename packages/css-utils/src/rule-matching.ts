import type { CapturedCSSRule } from '@repro/domain'

export interface VTreeContext {
  tagName: string
  id: string | null
  classList: string[]
  attributes: Record<string, string | null | undefined>
  matchesSelector?: (selector: string) => boolean
}

function splitSelectors(selectorText: string): string[] {
  if (!selectorText || selectorText.trim().length === 0) {
    return []
  }
  return selectorText.split(',').map(s => s.trim())
}

function parseVTreeSelector(selector: string): {
  tag?: string
  id?: string
  classes: string[]
  attributes: Array<{ name: string; op?: string; value?: string }>
  pseudoClasses: string[]
  combinator?: string
} {
  const result: ReturnType<typeof parseVTreeSelector> = {
    classes: [],
    attributes: [],
    pseudoClasses: [],
  }

  let i = 0

  // Check for combinator prefix
  while (i < selector.length && selector[i] === ' ') i++
  if (i > 0) result.combinator = 'descendant'

  if (i < selector.length && selector[i] === '>') {
    result.combinator = 'child'
    i++
    while (i < selector.length && selector[i] === ' ') i++
  }

  while (i < selector.length) {
    const ch = selector[i]!

    if (ch === ' ') {
      i++
      continue
    }

    // Combinator
    if (ch === '>' || ch === '+' || ch === '~') {
      result.combinator =
        ch === '>' ? 'child' : ch === '+' ? 'adjacent' : 'sibling'
      i++
      while (i < selector.length && selector[i] === ' ') i++
      continue
    }

    // Tag name
    if (/[a-zA-Z*]/.test(ch)) {
      if (ch === '*') {
        i++
        result.tag = '*'
        continue
      }
      let value = ''
      while (i < selector.length && /[\w-]/.test(selector[i]!)) {
        value += selector[i]!
        i++
      }
      result.tag = value
      continue
    }

    // ID
    if (ch === '#') {
      let value = ''
      i++
      while (i < selector.length && /[\w-]/.test(selector[i]!)) {
        value += selector[i]!
        i++
      }
      result.id = value
      continue
    }

    // Class
    if (ch === '.') {
      let value = ''
      i++
      while (i < selector.length && /[\w-]/.test(selector[i]!)) {
        value += selector[i]!
        i++
      }
      result.classes.push(value)
      continue
    }

    // Attribute
    if (ch === '[') {
      i++
      let name = ''
      let op: string | undefined
      let value: string | undefined
      let quoteChar: string | undefined

      // Read attribute name
      while (
        i < selector.length &&
        selector[i] !== ']' &&
        selector[i] !== '=' &&
        selector[i] !== '~' &&
        selector[i] !== '|' &&
        selector[i] !== '^' &&
        selector[i] !== '$' &&
        selector[i] !== '*'
      ) {
        name += selector[i]!
        i++
      }

      // Read operator (including the '=' sign)
      if (
        i < selector.length &&
        selector[i] === '~' &&
        i + 1 < selector.length &&
        selector[i + 1] === '='
      ) {
        op = '~='
        i += 2
      } else if (
        i < selector.length &&
        selector[i] === '|' &&
        i + 1 < selector.length &&
        selector[i + 1] === '='
      ) {
        op = '|='
        i += 2
      } else if (
        i < selector.length &&
        selector[i] === '^' &&
        i + 1 < selector.length &&
        selector[i + 1] === '='
      ) {
        op = '^='
        i += 2
      } else if (
        i < selector.length &&
        selector[i] === '$' &&
        i + 1 < selector.length &&
        selector[i + 1] === '='
      ) {
        op = '$='
        i += 2
      } else if (
        i < selector.length &&
        selector[i] === '*' &&
        i + 1 < selector.length &&
        selector[i + 1] === '='
      ) {
        op = '*='
        i += 2
      } else if (i < selector.length && selector[i] === '=') {
        op = '='
        i++
      }

      // Read value
      if (i < selector.length && (selector[i] === '"' || selector[i] === "'")) {
        quoteChar = selector[i]!
        i++
        value = ''
        while (i < selector.length && selector[i] !== quoteChar) {
          value += selector[i]!
          i++
        }
        if (i < selector.length) i++ // skip closing quote
      } else {
        value = ''
        while (i < selector.length && selector[i] !== ']') {
          value += selector[i]!
          i++
        }
      }

      if (i < selector.length && selector[i] === ']') i++

      result.attributes.push({ name: name.trim(), op, value })
      continue
    }

    // Pseudo-class
    if (ch === ':') {
      i++
      if (i < selector.length && selector[i] === ':') {
        // ::pseudo-element - skip for basic matching
        i++
        while (i < selector.length && /[\w-]/.test(selector[i]!)) i++
        // skip args
        if (i < selector.length && selector[i] === '(') {
          let depth = 1
          i++
          while (i < selector.length && depth > 0) {
            if (selector[i] === '(') depth++
            if (selector[i] === ')') depth--
            i++
          }
        }
        continue
      }
      let value = ':'
      while (i < selector.length && /[\w-]/.test(selector[i]!)) {
        value += selector[i]!
        i++
      }
      if (i < selector.length && selector[i] === '(') {
        let depth = 1
        i++
        while (i < selector.length && depth > 0) {
          if (selector[i] === '(') depth++
          if (selector[i] === ')') depth--
          i++
        }
      }
      result.pseudoClasses.push(value)
      continue
    }

    i++
  }

  return result
}

function matchesSimpleSelector(
  parsed: ReturnType<typeof parseVTreeSelector>,
  vTree: VTreeContext
): boolean {
  // If tag is '*' or no tag specified, skip tag check
  if (parsed.tag && parsed.tag !== '*') {
    if (vTree.tagName.toLowerCase() !== parsed.tag.toLowerCase()) {
      return false
    }
  }

  // Check ID
  if (parsed.id !== undefined && vTree.id !== parsed.id) {
    return false
  }

  // Check classes
  for (const cls of parsed.classes) {
    if (!vTree.classList.includes(cls)) {
      return false
    }
  }

  // Check attributes
  for (const attr of parsed.attributes) {
    const actualValue = vTree.attributes[attr.name]

    if (attr.op === undefined || attr.op === '=') {
      // Simple presence or exact match
      if (attr.value === undefined) {
        if (actualValue === undefined || actualValue === null) return false
      } else if (actualValue !== attr.value) {
        return false
      }
    } else if (attr.op === '~=') {
      if (typeof actualValue !== 'string') return false
      const values = actualValue.split(' ')
      if (!values.includes(attr.value ?? '')) return false
    } else if (attr.op === '|=') {
      if (typeof actualValue !== 'string') return false
      if (
        actualValue !== attr.value &&
        !actualValue.startsWith(`${attr.value}-`)
      )
        return false
    } else if (attr.op === '^=') {
      if (typeof actualValue !== 'string') return false
      if (!actualValue.startsWith(attr.value ?? '')) return false
    } else if (attr.op === '$=') {
      if (typeof actualValue !== 'string') return false
      if (!actualValue.endsWith(attr.value ?? '')) return false
    } else if (attr.op === '*=') {
      if (typeof actualValue !== 'string') return false
      if (!actualValue.includes(attr.value ?? '')) return false
    } else {
      // Unknown operator — be conservative, require presence
      if (actualValue === undefined || actualValue === null) return false
    }
  }

  return true
}

/**
 * Match CSS rules against a live DOM element using Element.matches().
 */
export function matchCSSRules(
  rules: CapturedCSSRule[],
  element: Element
): CapturedCSSRule[] {
  return rules.filter(rule => {
    if (!rule.selectorText || rule.selectorText.trim().length === 0) {
      // Inline styles always match their element
      return true
    }
    const selectors = splitSelectors(rule.selectorText)
    return selectors.some(sel => element.matches(sel))
  })
}

/**
 * Match CSS rules against a virtual tree context (no live DOM).
 * Uses basic selector parsing with conservative fallback.
 */
export function matchCSSRulesVTree(
  rules: CapturedCSSRule[],
  vTree: VTreeContext
): CapturedCSSRule[] {
  return rules.filter(rule => {
    if (!rule.selectorText || rule.selectorText.trim().length === 0) {
      return true
    }

    const selectors = splitSelectors(rule.selectorText)

    return selectors.some(sel => {
      // If a matchesSelector hook is provided, use it
      if (vTree.matchesSelector) {
        try {
          if (vTree.matchesSelector(sel)) return true
        } catch {
          // fall through to basic matching
        }
      }

      // For complex selectors with combinators or pseudo-classes that
      // are hard to evaluate without a real DOM, be conservative:
      // if the selector has combinators (space, >, +, ~ outside parens)
      // or complex pseudo-classes, include the rule.
      // We still do the basic tag/class/ID/attribute check as a filter.
      const hasComplexPseudo =
        /:(?:not|is|has|where|nth-|first-|last-|only-|empty|root|target|link|visited|hover|active|focus|checked|disabled|enabled|required|optional|read-only|read-write|valid|invalid|in-range|out-of-range|lang|dir)\(/.test(
          sel
        )
      const hasCombinator =
        / (?!\()/.test(sel) || />/.test(sel) || /\+/.test(sel) || /~/.test(sel)

      const parsed = parseVTreeSelector(sel)

      // If the selector has combinators or has a complex pseudo-class,
      // do a basic element-level check and include conservatively.
      if (hasCombinator || hasComplexPseudo) {
        return matchesSimpleSelector(parsed, vTree)
      }

      // Simple compound selector
      return matchesSimpleSelector(parsed, vTree)
    })
  })
}
