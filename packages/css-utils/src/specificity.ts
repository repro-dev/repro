export interface Specificity {
  id: number
  class: number
  type: number
  pseudoClass: number
  pseudoElement: number
}

/**
 * Computes CSS specificity for a given selector string.
 * Returns individual component scores in descending order of importance:
 * id > class > type > pseudoClass > pseudoElement
 *
 * For comparison, use: id*10000 + class*100 + type*10 + pseudoClass + pseudoElement
 * or use the `compareSpecificity(a, b)` helper.
 */
export function computeSpecificity(selector: string): Specificity {
  let id = 0
  let classCount = 0
  let type = 0
  let pseudoClass = 0
  let pseudoElement = 0

  // Handle selector list — use only first selector
  const firstSelector = selector.split(',')[0]!.trim()

  // ID selectors: #<ident>
  id = (firstSelector.match(/#[\w-]/g) ?? []).length

  // Attribute selectors: [<ident>]
  classCount += (firstSelector.match(/\[[^\]]+\]/g) ?? []).length

  // Class selectors: .<ident>
  classCount += (firstSelector.match(/\.[\w-]/g) ?? []).length

  // Pseudo-elements: ::<ident>
  pseudoElement = (firstSelector.match(/::[\w-]/g) ?? []).length

  // Pseudo-classes: :<ident> that are NOT pseudo-elements
  const pseudoElementPositions = new Set()
  for (const match of firstSelector.matchAll(/::[\w-]/g)) {
    // Mark all positions covered by this :: pseudo-element match
    const matchStr = match[0]!
    for (let i = 0; i < matchStr.length; i++) {
      pseudoElementPositions.add(match.index! + i)
    }
  }

  for (const match of firstSelector.matchAll(/:[\w-]/g)) {
    const pos = match.index!
    const following = firstSelector.slice(pos)
    if (following.startsWith('::*') || following.startsWith('::')) continue
    if (pseudoElementPositions.has(pos)) continue
    pseudoClass++
  }

  // Type selectors: <ident> (not universal *, not after pseudo-classes)
  const parts = firstSelector.split(/[\s>+~]/)
  for (const part of parts) {
    const trimmed = part.trim()
    if (!trimmed || trimmed === '*' || /^[[#.:#]/.test(trimmed)) continue
    if (/^:(?!:)/.test(trimmed)) continue
    type++
  }

  return { id, class: classCount, type, pseudoClass, pseudoElement }
}

/**
 * Compares two specificities. Returns negative if a < b, 0 if equal, positive if a > b.
 * Order: id > class > type > pseudoClass > pseudoElement
 */
export function compareSpecificity(a: Specificity, b: Specificity): number {
  const W_ID = 10_000
  const W_CLASS = 100
  const W_TYPE = 10

  const scoreA =
    a.id * W_ID +
    a.class * W_CLASS +
    a.type * W_TYPE +
    a.pseudoClass +
    a.pseudoElement
  const scoreB =
    b.id * W_ID +
    b.class * W_CLASS +
    b.type * W_TYPE +
    b.pseudoClass +
    b.pseudoElement

  return scoreA - scoreB
}
