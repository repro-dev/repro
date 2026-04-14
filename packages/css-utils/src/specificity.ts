// CSS specificity as a tuple: [id, class/attr/pseudo-class, element/pseudo-element]
export type Specificity = [number, number, number]

// Functional pseudo-classes whose argument specificity is counted (not :where)
const COUNTED_PSEUDOS = new Set(['not', 'is', 'has', 'matches'])

/**
 * Calculate CSS specificity for a single selector string.
 * Handles comma-separated selectors by returning the max specificity.
 * Guards against infinite loops with a 1000-iteration cap.
 */
export function calculateSpecificity(selector: string): Specificity {
  // Handle comma-separated selector list — return max specificity
  const parts = splitSelectorList(selector)

  if (parts.length > 1) {
    return parts.reduce(
      (max, part) => {
        const s = calculateSpecificity(part.trim())
        return compareSpecificity(s, max) > 0 ? s : max
      },
      [0, 0, 0]
    )
  }

  return parseSingleSelector(selector.trim())
}

/**
 * Compare two specificity values.
 * Returns positive if a > b, negative if a < b, 0 if equal.
 */
export function compareSpecificity(a: Specificity, b: Specificity): number {
  if (a[0] !== b[0]) return a[0] - b[0]
  if (a[1] !== b[1]) return a[1] - b[1]
  return a[2] - b[2]
}

// Split on commas that are not inside parentheses
function splitSelectorList(selector: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0

  for (let i = 0; i < selector.length; i++) {
    const ch = selector[i]
    if (ch === '(') depth++
    else if (ch === ')') depth--
    else if (ch === ',' && depth === 0) {
      parts.push(selector.slice(start, i))
      start = i + 1
    }
  }

  parts.push(selector.slice(start))
  return parts
}

function parseSingleSelector(selector: string): Specificity {
  let id = 0
  let cls = 0
  let el = 0

  // Iteration guard to prevent infinite loops with deeply nested pseudo-selectors
  const MAX_ITERATIONS = 1000
  let iterations = 0

  // We walk through the selector character by character using an index
  let i = 0

  while (i < selector.length) {
    if (++iterations > MAX_ITERATIONS) {
      return [0, 0, 0]
    }

    // noUncheckedIndexedAccess: guard against undefined
    const ch = selector[i]
    if (ch === undefined) break

    // Skip combinators and whitespace
    if (ch === ' ' || ch === '>' || ch === '+' || ch === '~' || ch === '|') {
      i++
      continue
    }

    // Universal selector — no specificity contribution
    if (ch === '*') {
      i++
      continue
    }

    // ID selector: #foo
    if (ch === '#') {
      id++
      i++
      while (i < selector.length) {
        const c = selector[i]
        if (c === undefined || !isIdentChar(c)) break
        i++
      }
      continue
    }

    // Class selector: .foo
    if (ch === '.') {
      cls++
      i++
      while (i < selector.length) {
        const c = selector[i]
        if (c === undefined || !isIdentChar(c)) break
        i++
      }
      continue
    }

    // Attribute selector: [attr] or [attr=val] etc.
    if (ch === '[') {
      cls++
      // skip to matching ]
      while (i < selector.length && selector[i] !== ']') i++
      i++ // consume ']'
      continue
    }

    // Pseudo-element or pseudo-class: :foo or ::foo
    if (ch === ':') {
      i++ // skip first ':'
      const nextCh = selector[i]
      if (nextCh === ':') {
        // pseudo-element
        i++
        while (i < selector.length) {
          const c = selector[i]
          if (c === undefined || !isIdentChar(c)) break
          i++
        }
        el++
        continue
      }

      // pseudo-class — read the name
      const nameStart = i
      while (i < selector.length) {
        const c = selector[i]
        if (c === undefined || !isIdentChar(c)) break
        i++
      }
      const name = selector.slice(nameStart, i).toLowerCase()

      const parenCh = selector[i]
      if (parenCh === '(') {
        // Functional pseudo-class — extract argument list
        i++ // skip '('
        const argStart = i
        let depth = 1
        while (i < selector.length && depth > 0) {
          const c = selector[i]
          if (c === '(') depth++
          else if (c === ')') depth--
          if (depth > 0) i++
          else i++ // consume closing ')'
        }
        const argContent = selector.slice(argStart, i - 1)

        if (name === 'where') {
          // :where() contributes 0 specificity
        } else if (COUNTED_PSEUDOS.has(name)) {
          // Use the max specificity of the argument list
          const argSpec = calculateSpecificity(argContent)
          id += argSpec[0]
          cls += argSpec[1]
          el += argSpec[2]
        } else {
          // Other functional pseudo-classes (e.g. :nth-child) count as class
          cls++
        }
      } else {
        // Simple pseudo-class
        cls++
      }

      continue
    }

    // Element/type selector: div, span, etc.
    if (isIdentStartChar(ch)) {
      el++
      i++
      while (i < selector.length) {
        const c = selector[i]
        if (c === undefined || !isIdentChar(c)) break
        i++
      }
      continue
    }

    // Unknown character — skip
    i++
  }

  return [id, cls, el]
}

function isIdentStartChar(ch: string): boolean {
  return /[a-zA-Z_-]/.test(ch)
}

function isIdentChar(ch: string): boolean {
  return /[a-zA-Z0-9_-]/.test(ch)
}
