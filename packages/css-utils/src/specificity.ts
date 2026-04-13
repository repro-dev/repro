/**
 * CSS Specificity Calculator
 *
 * Calculates specificity according to CSS spec:
 * - ID selectors (#foo): 0,1,0
 * - Class (.foo), attribute ([foo]), pseudo-class (:hover): 0,0,1
 * - Element (div), pseudo-element (::before): 0,0,0,1
 *
 * Special cases:
 * - :where() = 0,0,0 (always zero specificity)
 * - :not(), :is(), :has() take the max specificity of their arguments
 */

export type Specificity = [number, number, number]

const SPECIFICITY_PARTS = 3

export function calculateSpecificity(selector: string): Specificity {
  const specificity: Specificity = [0, 0, 0]

  if (selector.includes(':where(')) {
    return specificity
  }

  const tokens = tokenizeSelector(selector)

  let inNotIsHas = 0
  let parenDepth = 0
  const currentArg: string[] = []

  for (const token of tokens) {
    if (token === '(') {
      parenDepth++
      if (parenDepth > 1 || inNotIsHas === 0) {
        currentArg.push('(')
      }
      continue
    }

    if (token === ')') {
      parenDepth--
      if (parenDepth === 0 && inNotIsHas > 0) {
        const argString = currentArg.join('').trim()
        if (argString) {
          const argSpec = calculateSpecificity(argString)
          for (let i = 0; i < SPECIFICITY_PARTS; i++) {
            const current = specificity[i] ?? 0
            const arg = argSpec[i] ?? 0
            specificity[i] = Math.max(current, arg)
          }
        }
        currentArg.length = 0
        inNotIsHas = 0
      } else if (parenDepth >= 1) {
        currentArg.push(')')
      }
      continue
    }

    if (parenDepth > 0) {
      currentArg.push(token)
      continue
    }

    switch (token) {
      case '#':
        specificity[0] = (specificity[0] ?? 0) + 1
        break
      case '.':
      case '[':
        specificity[1] = (specificity[1] ?? 0) + 1
        break
      case ':':
        break
      default:
        if (token.startsWith(':not(') || token === ':not') {
          inNotIsHas = 1
          if (token.length > 5) {
            currentArg.push(token.slice(5, -1))
          }
        } else if (token.startsWith(':is(') || token === ':is') {
          inNotIsHas = 2
          if (token.length > 4) {
            currentArg.push(token.slice(4, -1))
          }
        } else if (token.startsWith(':has(') || token === ':has') {
          inNotIsHas = 3
          if (token.length > 5) {
            currentArg.push(token.slice(5, -1))
          }
        } else if (
          token.startsWith('::') ||
          [
            '::before',
            '::after',
            '::first-line',
            '::first-letter',
            '::selection',
            '::placeholder',
            '::marker',
            '::spelling-error',
            '::grammar-error',
          ].includes(token)
        ) {
          specificity[2] = (specificity[2] ?? 0) + 1
        } else if (
          token.startsWith(':') &&
          ![':not(', ':is(', ':has(', ':where(', ':where'].some(p =>
            token.startsWith(p)
          )
        ) {
          specificity[1] = (specificity[1] ?? 0) + 1
        } else if (/^[a-zA-Z]/.test(token)) {
          specificity[2] = (specificity[2] ?? 0) + 1
        }
    }
  }

  return specificity
}

export function compareSpecificity(a: Specificity, b: Specificity): number {
  for (let i = 0; i < SPECIFICITY_PARTS; i++) {
    const aVal = a[i] ?? 0
    const bVal = b[i] ?? 0
    if (aVal !== bVal) {
      return aVal - bVal
    }
  }
  return 0
}

function tokenizeSelector(selector: string): string[] {
  const tokens: string[] = []
  let current = ''
  let inAttribute = false
  let inParen = 0

  let i = 0
  while (i < selector.length) {
    const char = selector[i] ?? ''

    if (inAttribute) {
      current += char
      if (char === ']') {
        tokens.push(current)
        current = ''
        inAttribute = false
      }
    } else if (inParen > 0) {
      current += char
      if (char === '(') {
        inParen++
      } else if (char === ')') {
        inParen--
      }
      if (inParen === 0) {
        tokens.push(current)
        current = ''
      }
    } else if (char === '[') {
      if (current) {
        tokens.push(current)
        current = ''
      }
      inAttribute = true
      current = char
    } else if (char === '(') {
      if (current) {
        tokens.push(current)
        current = ''
      }
      inParen = 1
      current = char
    } else if (/[.#:[\],>+~*\s]/.test(char)) {
      if (current.trim()) {
        tokens.push(current.trim())
        current = ''
      }
      if (char === '.' || char === '#' || char === ':' || char === '[') {
        const nextChar = selector[i + 1] ?? ''
        if (
          (char === ':' && nextChar === ':') ||
          (char === ':' &&
            (selector.slice(i + 1, i + 5) === 'not(' ||
              selector.slice(i + 1, i + 4) === 'is(' ||
              selector.slice(i + 1, i + 5) === 'has(' ||
              selector.slice(i + 1, i + 7) === 'where('))
        ) {
          current += char
        } else if (
          char === ':' &&
          ['::before', '::after', '::first-line', '::first-letter'].some(
            p => selector.slice(i, i + p.length) === p
          )
        ) {
          tokens.push(selector.slice(i, i + 10) ?? '')
          i += 9
        } else {
          tokens.push(char)
        }
      } else if (char === ' ' || char === '\t' || char === '\n') {
        if (current.trim()) {
          tokens.push(current.trim())
          current = ''
        }
      } else {
        tokens.push(char)
      }
    } else {
      current += char
    }

    i++
  }

  if (current.trim()) {
    tokens.push(current.trim())
  }

  return tokens
}
