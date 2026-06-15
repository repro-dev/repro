import type { CapturedCSSRule } from '@repro/domain'

export interface InheritedProperty {
  property: string
  value: string
  source: 'inherited' | 'default'
  sourceElement: {
    tagName: string
    id?: string
    className?: string
  } | null
}

export interface InheritanceContext {
  tagName: string
  id: string | null
  classList: string[]
  ancestors: Array<{
    tagName: string
    id: string | null
    classList: string[]
    matchedRules: CapturedCSSRule[]
  }>
}

// Standard list of inherited CSS properties
export const INHERITED_PROPERTIES: ReadonlySet<string> = new Set([
  'color',
  'cursor',
  'direction',
  'font-family',
  'font-size',
  'font-style',
  'font-variant',
  'font-weight',
  'font-stretch',
  'font-size-adjust',
  'font',
  'letter-spacing',
  'line-height',
  'quotes',
  'text-align',
  'text-indent',
  'text-transform',
  'text-shadow',
  'visibility',
  'white-space',
  'word-spacing',
  'caption-side',
  'border-collapse',
  'border-spacing',
  'empty-cells',
  'list-style',
  'list-style-type',
  'list-style-image',
  'list-style-position',
  'orphans',
  'widows',
])

/**
 * Resolve inherited properties for an element.
 *
 * Element's own matched rules take precedence over inherited values.
 * Walks ancestors from nearest to furthest; first match wins.
 */
export function resolveInheritedProperties(
  element: InheritanceContext,
  elementRules: CapturedCSSRule[]
): InheritedProperty[] {
  const result: InheritedProperty[] = []
  const resolved = new Set<string>()

  // Step 1: Collect all inherited-property declarations from element's own rules
  for (const rule of elementRules) {
    for (const [prop, value] of Object.entries(rule.declarations)) {
      if (INHERITED_PROPERTIES.has(prop) && !resolved.has(prop)) {
        resolved.add(prop)
        result.push({
          property: prop,
          value,
          source: 'inherited',
          sourceElement: {
            tagName: element.tagName,
            id: element.id ?? undefined,
            className:
              element.classList.length > 0
                ? element.classList.join(' ')
                : undefined,
          },
        })
      }
    }
  }

  // Step 2: Walk ancestors from nearest to furthest
  for (const ancestor of element.ancestors) {
    for (const rule of ancestor.matchedRules) {
      for (const [prop, value] of Object.entries(rule.declarations)) {
        if (INHERITED_PROPERTIES.has(prop) && !resolved.has(prop)) {
          resolved.add(prop)
          result.push({
            property: prop,
            value,
            source: 'inherited',
            sourceElement: {
              tagName: ancestor.tagName,
              id: ancestor.id ?? undefined,
              className:
                ancestor.classList.length > 0
                  ? ancestor.classList.join(' ')
                  : undefined,
            },
          })
        }
      }
    }
  }

  return result
}
