export type ElementCSSRule = {
  selectorText: string
  cssText: string
}

export function getCSSText(): string {
  const rules: string[] = []
  for (let i = 0; i < document.styleSheets.length; i++) {
    const sheet = document.styleSheets[i]
    if (!sheet) continue
    try {
      for (const rule of Array.from(sheet.cssRules || [])) {
        rules.push(rule.cssText)
      }
    } catch {
      // cross-origin sheets; ignore
    }
  }
  return rules.join('\n')
}

export function getElementCSSRules(el: Element): ElementCSSRule[] {
  const classNames = new Set(Array.from(el.classList))
  const matchingRules: ElementCSSRule[] = []
  for (let i = 0; i < document.styleSheets.length; i++) {
    const sheet = document.styleSheets[i]
    if (!sheet) continue
    try {
      for (const rule of Array.from(sheet.cssRules || [])) {
        if (
          !('selectorText' in rule) ||
          typeof rule.selectorText !== 'string'
        ) {
          continue
        }
        const selectorClassNames = Array.from(
          rule.selectorText.matchAll(/\.([\w-]+)/g),
          ([, className]) => className
        ).filter((c): c is string => c !== undefined)
        if (selectorClassNames.some(className => classNames.has(className))) {
          matchingRules.push({
            selectorText: rule.selectorText,
            cssText: rule.cssText,
          })
        }
      }
    } catch {
      // cross-origin sheets; ignore
    }
  }
  return matchingRules
}

export function getElementCSSText(el: Element): string {
  const classNames = new Set(Array.from(el.classList))
  const matchingRules: string[] = []
  for (let i = 0; i < document.styleSheets.length; i++) {
    const sheet = document.styleSheets[i]
    if (!sheet) continue
    try {
      for (const rule of Array.from(sheet.cssRules || [])) {
        const cssText = rule.cssText
        const selectorMatch = cssText.match(/^\.([\w-]+)/)
        if (selectorMatch && classNames.has(selectorMatch[1]!)) {
          matchingRules.push(cssText)
        }
      }
    } catch {
      // cross-origin sheets; ignore
    }
  }
  return matchingRules.join('\n')
}
