export interface ParsedDeclaration {
  property: string
  value: string
}

export interface ParsedCSSRule {
  selector: string
  declarations: ParsedDeclaration[]
  mediaText: string | null
  supportsText: string | null
}

/**
 * Parses a single CSS rule string into its components.
 * Extracts: selector, declarations, @media text, @supports text.
 *
 * Uses regex-based parsing for browser compatibility (CSSOM is read-only in workers).
 */
export function parseCSSRule(cssText: string): ParsedCSSRule {
  const trimmed = cssText.trim()

  // Extract @media block
  const mediaMatch = trimmed.match(/^@media\s+([^{]+)\{\s*([\s\S]*?)\s*\}\s*$/i)
  if (mediaMatch) {
    const mediaText = mediaMatch[1]!.trim()
    const blockContent = mediaMatch[2]!
    return parseRuleBlock(blockContent, mediaText, null)
  }

  // Extract @supports block
  const supportsMatch = trimmed.match(
    /^@supports\s+([^{]+)\{\s*([\s\S]*?)\s*\}\s*$/i
  )
  if (supportsMatch) {
    const supportsText = supportsMatch[1]!.trim()
    const blockContent = supportsMatch[2]!
    return parseRuleBlock(blockContent, null, supportsText)
  }

  // Regular rule: selector { declarations }
  const ruleMatch = trimmed.match(/^([^{]+)\{\s*([\s\S]*?)\s*\}\s*$/)
  if (ruleMatch) {
    const selector = ruleMatch[1]!.trim()
    const declarationsText = ruleMatch[2]!
    return {
      selector,
      declarations: parseDeclarations(declarationsText),
      mediaText: null,
      supportsText: null,
    }
  }

  // Malformed or empty
  return { selector: '', declarations: [], mediaText: null, supportsText: null }
}

function parseRuleBlock(
  blockContent: string,
  mediaText: string | null,
  supportsText: string | null
): ParsedCSSRule {
  // Find the first rule inside the block
  const innerMatch = blockContent.match(/([^{}]+)\{([\s\S]*?)\}/)
  if (innerMatch) {
    return {
      selector: innerMatch[1]!.trim(),
      declarations: parseDeclarations(innerMatch[2]!),
      mediaText,
      supportsText,
    }
  }

  return { selector: '', declarations: [], mediaText, supportsText }
}

function parseDeclarations(text: string): ParsedDeclaration[] {
  const result: ParsedDeclaration[] = []

  // Remove CSS comments
  const cleaned = text.replace(/\/\*[\s\S]*?\*\//g, '')

  // Match property: value; pairs
  const declRegex = /([\w-]+)\s*:\s*([^;{}]+)(?:;|\s*(?=\w|-+\s*:)|$)/g
  let match: RegExpExecArray | null

  while ((match = declRegex.exec(cleaned)) !== null) {
    const property = match[1]!.trim()
    const value = match[2]!.trim()
    if (property) {
      result.push({ property, value })
    }
  }

  return result
}
