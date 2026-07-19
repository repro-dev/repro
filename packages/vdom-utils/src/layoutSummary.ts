import { VTree } from '@repro/domain'
import { isDocumentVNode, isElementVNode, isTextVNode } from './matchers'

// ─── Types ───────────────────────────────────────────────────────────────────

export type DetailLevel = 'overview' | 'regions' | 'detailed'

export interface LayoutSummaryOptions {
  detail?: DetailLevel
  maxChildrenPerRegion?: number
  maxDepth?: number
  maxCTAs?: number
  viewportWidth?: number
  viewportHeight?: number
}

export interface LayoutCTARef {
  label: string
  ref: string
}

export interface LayoutRegion {
  type: string
  name: string
  ref: string | null
  children: LayoutRegion[]
  ctas: LayoutCTARef[]
  textHint: string | null
  gridInfo: { columns: number; itemCount: number } | null
  /** Number of direct children that were elided due to bounding. */
  truncatedChildCount?: number
}

export interface LayoutSummary {
  framing: 'DESKTOP' | 'MOBILE'
  detail: DetailLevel
  viewport: [number, number]
  regions: LayoutRegion[]
  truncated: { children: number; nested: number }
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Default viewport when no interaction is provided. */
const DEFAULT_VIEWPORT: [number, number] = [1440, 900]

/** Desktop viewport threshold (pixels). */
const DESKTOP_WIDTH_THRESHOLD = 1024

/** Maximum text-hint length before truncation. */
const TEXT_HINT_MAX_LENGTH = 80

/**
 * Approximate token equivalent of a typical 1024×768 screenshot in an LLM
 * vision API (4–8K tokens, midpoint ~6K; we use a conservative 5000 as the
 * "meaningfully smaller" threshold).
 */
export const SCREENSHOT_TOKEN_EQUIVALENT = 5000

/** Action keywords for heuristic CTA detection. */
const CTA_KEYWORDS = [
  'submit',
  'save',
  'delete',
  'confirm',
  'create',
  'add',
  'sign',
  'log',
  'register',
  'buy',
  'checkout',
  'pay',
  'upgrade',
  'download',
  'install',
  'continue',
  'next',
  'done',
  'ok',
  'yes',
]

/** CSS class keywords for heuristic CTA detection. */
const CTA_CLASS_KEYWORDS = ['primary', 'cta', 'call-to-action']

/**
 * Mapping from HTML tag name to implicit ARIA role.
 * Subset of the mapping in a11yTree.ts, sufficient for layout region
 * classification.
 */
const IMPLICIT_ROLE_MAP: Record<string, string> = {
  a: 'link',
  article: 'article',
  aside: 'complementary',
  button: 'button',
  dialog: 'dialog',
  footer: 'contentinfo',
  form: 'form',
  h1: 'heading',
  h2: 'heading',
  h3: 'heading',
  h4: 'heading',
  h5: 'heading',
  h6: 'heading',
  header: 'banner',
  hr: 'separator',
  img: 'img',
  input: 'textbox',
  li: 'listitem',
  main: 'main',
  nav: 'navigation',
  ol: 'list',
  option: 'option',
  section: 'region',
  select: 'combobox',
  table: 'table',
  td: 'cell',
  textarea: 'textbox',
  th: 'columnheader',
  ul: 'list',
}

const INPUT_ROLE_MAP: Record<string, string> = {
  checkbox: 'checkbox',
  radio: 'radio',
  range: 'slider',
  search: 'searchbox',
  submit: 'button',
  reset: 'button',
  button: 'button',
}

/**
 * Role → layout region type label.
 * Non-landmark roles produce null and are either hoisted or
 * contribute to grid/CTA detection only.
 */
const ROLE_TO_REGION_TYPE: Record<string, string> = {
  banner: 'BANNER',
  navigation: 'NAVIGATION',
  main: 'MAIN',
  complementary: 'COMPLEMENTARY',
  contentinfo: 'CONTENTINFO',
  form: 'FORM',
  region: 'SECTION',
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function computeRole(
  tagName: string,
  attributes: Record<string, string | null>
): string | null {
  const explicitRole = attributes['role']
  if (explicitRole) return explicitRole

  if (tagName === 'input') {
    const inputType = attributes['type'] ?? 'text'
    return INPUT_ROLE_MAP[inputType] ?? 'textbox'
  }

  return IMPLICIT_ROLE_MAP[tagName] ?? null
}

function collectTextContent(nodeId: string, vtree: VTree): string {
  const parts: string[] = []

  function walk(id: string) {
    const node = vtree.nodes[id]
    if (!node) return

    if (isTextVNode(node)) {
      const val = node.get('value').orElse('')
      if (val) parts.push(val)
      return
    }

    if (isElementVNode(node)) {
      const children = node.get('children').orElse([]) as string[]
      for (const childId of children) {
        walk(childId)
      }
    }
  }

  walk(nodeId)
  return parts.join(' ').trim()
}

function computeAccessibleName(
  tagName: string,
  attributes: Record<string, string | null>,
  nodeId: string,
  vtree: VTree
): string {
  const ariaLabel = attributes['aria-label']
  if (ariaLabel) return ariaLabel

  const alt = attributes['alt']
  if (alt) return alt

  const title = attributes['title']
  if (title) return title

  const placeholder = attributes['placeholder']
  if (placeholder) return placeholder

  if (tagName === 'button' || tagName === 'a') {
    return collectTextContent(nodeId, vtree)
  }

  return ''
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength - 1) + '…'
}

/**
 * Determine if an element qualifies as a primary CTA.
 * Heuristic:
 * 1. `<button type="submit">` or `<input type="submit">` → strongest signal.
 * 2. `role=button` or `<a>` with accessible name containing an action keyword.
 * 3. Bonus: class attribute contains `primary`, `cta`, or `call-to-action`.
 */
function isCTA(
  tagName: string,
  attributes: Record<string, string | null>,
  name: string
): boolean {
  // Strong signal: type="submit"
  if (attributes['type'] === 'submit') return true

  // Must be a button, link, or have role=button
  const role = computeRole(tagName, attributes)
  if (role !== 'button' && tagName !== 'a') return false

  // Check name for action keywords
  const lowerName = name.toLowerCase()
  const hasKeyword = CTA_KEYWORDS.some(kw =>
    lowerName.includes(kw.toLowerCase())
  )
  if (hasKeyword) return true

  // Check class for CTA keywords
  const classAttr = attributes['class'] ?? ''
  const hasClassKeyword = CTA_CLASS_KEYWORDS.some(kw =>
    classAttr.toLowerCase().includes(kw)
  )
  if (hasClassKeyword) return true

  return false
}

function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4)
}

// ─── VTree walker helpers ─────────────────────────────────────────────────────

function getElementInfo(
  nodeId: string,
  vtree: VTree
): {
  tagName: string
  attributes: Record<string, string | null>
  children: string[]
  role: string | null
  name: string
} | null {
  const node = vtree.nodes[nodeId]
  if (!node) return null
  if (!isElementVNode(node)) return null

  const tagName = node.get('tagName').orElse('')
  const attributes = node.get('attributes').orElse({}) as Record<
    string,
    string | null
  >
  const children = node.get('children').orElse([]) as string[]
  const role = computeRole(tagName, attributes)
  const name = computeAccessibleName(tagName, attributes, nodeId, vtree)

  return { tagName, attributes, children, role, name }
}

function isModal(
  role: string | null,
  attributes: Record<string, string | null>
): boolean {
  return role === 'dialog' && attributes['aria-modal'] === 'true'
}

function isLandmark(role: string | null): boolean {
  if (!role) return false
  return role in ROLE_TO_REGION_TYPE
}

function regionTypeForRole(role: string, isDesktop: boolean): string {
  // Navigation → SIDEBAR on desktop (nav before main), NAVIGATION on mobile
  if (role === 'navigation') {
    return isDesktop ? 'SIDEBAR' : 'NAVIGATION'
  }
  // Complementary → SIDEBAR on desktop if positioned as sidebar, else COMPLEMENTARY
  if (role === 'complementary') {
    return isDesktop ? 'SIDEBAR' : 'COMPLEMENTARY'
  }
  return ROLE_TO_REGION_TYPE[role] ?? role.toUpperCase()
}

// ─── Grid detection ──────────────────────────────────────────────────────────

function detectGrid(
  childrenIds: string[],
  vtree: VTree
): { columns: number; itemCount: number } | null {
  // Require at least 3 direct children
  if (childrenIds.length < 3) return null

  // Check that direct children are elements with the same tag
  const childInfo = childrenIds
    .map(id => getElementInfo(id, vtree))
    .filter(Boolean)

  if (childInfo.length < 3) return null

  const firstTag = childInfo[0]!.tagName
  const allSameTag = childInfo.every(c => c!.tagName === firstTag)

  if (!allSameTag) return null

  return { columns: childInfo.length, itemCount: childInfo.length }
}

// ─── Main builder ────────────────────────────────────────────────────────────

/**
 * Build a structural layout summary from a DOM VTree.
 *
 * Heuristics are deterministic:
 * 1. Walks the VTree document children looking for landmark ARIA roles
 *    (banner, navigation, main, complementary, contentinfo) and explicit
 *    `role` attributes.
 * 2. Modal detection: `role=dialog` + `aria-modal=true` surfaced as a
 *    separate top-level MODAL region.
 * 3. Grid detection: ≥3 direct children with identical tag → grouped as
 *    GRID with column count.
 * 4. CTA detection: `type=submit` first, then role=button with action-keyword
 *    name, capped by `maxCTAs`.
 * 5. Desktop (≥1024px) vs mobile (<1024px) framing via viewport width.
 * 6. Text hints truncated at 80 chars with `…`.
 */
export function buildLayoutSummary(
  vtree: VTree | null,
  interaction: { viewport: [number, number] } | null,
  options?: LayoutSummaryOptions
): LayoutSummary {
  const detail = options?.detail ?? 'regions'
  const maxCTAs = options?.maxCTAs ?? 3
  const viewportWidth =
    options?.viewportWidth ?? interaction?.viewport?.[0] ?? DEFAULT_VIEWPORT[0]
  const viewportHeight =
    options?.viewportHeight ?? interaction?.viewport?.[1] ?? DEFAULT_VIEWPORT[1]

  // Compute per-detail-level bounds
  const perDetailBounds = {
    overview: {
      maxChildrenPerRegion: options?.maxChildrenPerRegion ?? 6,
      maxDepth: options?.maxDepth ?? 1,
    },
    regions: {
      maxChildrenPerRegion: options?.maxChildrenPerRegion ?? 6,
      maxDepth: options?.maxDepth ?? 2,
    },
    detailed: {
      maxChildrenPerRegion: options?.maxChildrenPerRegion ?? 12,
      maxDepth: options?.maxDepth ?? 4,
    },
  }

  const bounds = perDetailBounds[detail]
  const isDesktop = viewportWidth >= DESKTOP_WIDTH_THRESHOLD
  const framing = isDesktop ? 'DESKTOP' : 'MOBILE'

  const regions: LayoutRegion[] = []
  const truncated = { children: 0, nested: 0 }

  if (!vtree) {
    return {
      framing,
      detail,
      viewport: [viewportWidth, viewportHeight],
      regions: [],
      truncated,
    }
  }

  const rootNode = vtree.nodes[vtree.rootId]
  if (!rootNode) {
    return {
      framing,
      detail,
      viewport: [viewportWidth, viewportHeight],
      regions: [],
      truncated,
    }
  }

  // Walk the VTree to find top-level regions
  let topLevelChildren: string[] = []
  if (isDocumentVNode(rootNode)) {
    topLevelChildren = rootNode.get('children').orElse([]) as string[]
  } else if (isElementVNode(rootNode)) {
    topLevelChildren = rootNode.get('children').orElse([]) as string[]
  }

  // First pass: scan for modals anywhere in the tree
  const modalRegions = findModals(topLevelChildren, vtree, bounds, maxCTAs)

  // Second pass: build region tree from top-level children
  const landmarkRegions = buildRegionTree(
    topLevelChildren,
    vtree,
    bounds,
    maxCTAs,
    framing,
    0,
    false,
    truncated
  )

  // Modals come first (they're overlays), then landmarks
  regions.push(...modalRegions, ...landmarkRegions)

  // MOBILE: collapse side regions (SIDEBAR) that appear after main
  if (!isDesktop) {
    collapseMobileSidebar(regions)
  }

  return {
    framing,
    detail,
    viewport: [viewportWidth, viewportHeight],
    regions,
    truncated,
  }
}

function findModals(
  childrenIds: string[],
  vtree: VTree,
  bounds: { maxChildrenPerRegion: number; maxDepth: number },
  maxCTAs: number
): LayoutRegion[] {
  const modals: LayoutRegion[] = []

  function walk(ids: string[], depth: number) {
    if (depth > bounds.maxDepth) return
    for (const id of ids) {
      const info = getElementInfo(id, vtree)
      if (!info) continue

      if (isModal(info.role, info.attributes)) {
        const ctas = findCTAs([id], vtree, maxCTAs)
        const textHint = collectTextContentFromChildren(id, vtree)
        modals.push({
          type: 'MODAL',
          name: info.name,
          ref: id,
          children: [],
          ctas,
          textHint: textHint
            ? truncateText(textHint, TEXT_HINT_MAX_LENGTH)
            : null,
          gridInfo: null,
        })
        // Don't recurse into modal children for more modals
        continue
      }

      walk((info as typeof info & { children: string[] }).children, depth + 1)
    }
  }

  walk(childrenIds, 0)
  return modals
}

function buildRegionTreeWithTruncation(
  childrenIds: string[],
  vtree: VTree,
  bounds: { maxChildrenPerRegion: number; maxDepth: number },
  maxCTAs: number,
  framing: string,
  depth: number,
  insideLandmark: boolean
): { regions: LayoutRegion[]; truncatedCount: number } {
  if (depth > bounds.maxDepth) {
    return { regions: [], truncatedCount: 1 }
  }

  const regions: LayoutRegion[] = []
  let truncatedAtThisLevel = 0

  for (let i = 0; i < childrenIds.length; i++) {
    const childId = childrenIds[i]!

    // Check for per-region child cap
    if (regions.length >= bounds.maxChildrenPerRegion) {
      truncatedAtThisLevel = childrenIds.length - i
      break
    }

    const info = getElementInfo(childId, vtree)
    if (!info) continue

    const role = info.role
    const attributes = info.attributes

    // Skip modals (handled separately)
    if (isModal(role, attributes)) {
      continue
    }

    if (isLandmark(role) && !insideLandmark) {
      const isDesktop = framing === 'DESKTOP'
      const regionType = regionTypeForRole(role!, isDesktop)
      let gridInfo: { columns: number; itemCount: number } | null = null

      const ctas = findCTAs(info.children, vtree, maxCTAs)

      const { regions: children, truncatedCount: childTruncation } =
        buildRegionTreeWithTruncation(
          info.children,
          vtree,
          bounds,
          maxCTAs,
          framing,
          depth + 1,
          true
        )

      if (children.length === 0 && ctas.length === 0) {
        gridInfo = detectGrid(info.children, vtree)
      }

      regions.push({
        type: regionType,
        name: info.name,
        ref: childId,
        children,
        ctas,
        textHint: null,
        gridInfo,
        truncatedChildCount: childTruncation > 0 ? childTruncation : undefined,
      })
    } else {
      if (insideLandmark && depth < bounds.maxDepth) {
        if (role === 'region' || info.tagName === 'section') {
          if (info.name) {
            const ctas = findCTAs(info.children, vtree, maxCTAs)
            const { regions: children, truncatedCount: childTruncation } =
              buildRegionTreeWithTruncation(
                info.children,
                vtree,
                bounds,
                maxCTAs,
                framing,
                depth + 1,
                true
              )
            regions.push({
              type: 'SECTION',
              name: info.name,
              ref: childId,
              children,
              ctas,
              textHint: null,
              gridInfo: null,
              truncatedChildCount:
                childTruncation > 0 ? childTruncation : undefined,
            })
          }
        } else if (role === 'form' || info.tagName === 'form') {
          const ctas = findCTAs(info.children, vtree, maxCTAs)
          const { regions: children, truncatedCount: childTruncation } =
            buildRegionTreeWithTruncation(
              info.children,
              vtree,
              bounds,
              maxCTAs,
              framing,
              depth + 1,
              true
            )
          regions.push({
            type: 'FORM',
            name: info.name,
            ref: childId,
            children,
            ctas,
            textHint: null,
            gridInfo: null,
            truncatedChildCount:
              childTruncation > 0 ? childTruncation : undefined,
          })
        }
      }
    }
  }

  return { regions, truncatedCount: truncatedAtThisLevel }
}

function buildRegionTree(
  childrenIds: string[],
  vtree: VTree,
  bounds: { maxChildrenPerRegion: number; maxDepth: number },
  maxCTAs: number,
  framing: string,
  depth: number,
  insideLandmark: boolean,
  truncated: { children: number; nested: number }
): LayoutRegion[] {
  const result = buildRegionTreeWithTruncation(
    childrenIds,
    vtree,
    bounds,
    maxCTAs,
    framing,
    depth,
    insideLandmark
  )
  truncated.children += result.truncatedCount
  return result.regions
}

function findCTAs(
  childrenIds: string[],
  vtree: VTree,
  maxCTAs: number
): LayoutCTARef[] {
  const ctas: LayoutCTARef[] = []

  function walk(ids: string[], depth: number) {
    if (ctas.length >= maxCTAs || depth > 5) return

    for (const id of ids) {
      if (ctas.length >= maxCTAs) return

      const info = getElementInfo(id, vtree)
      if (!info) continue

      if (isCTA(info.tagName, info.attributes, info.name)) {
        ctas.push({ label: info.name || info.tagName, ref: id })
      }

      walk(info.children, depth + 1)
    }
  }

  walk(childrenIds, 0)

  // Sort: submit-type first, then shorter name first
  ctas.sort((a, b) => {
    const aInfo = getElementInfo(a.ref, vtree)
    const bInfo = getElementInfo(b.ref, vtree)
    const aIsSubmit = aInfo?.attributes['type'] === 'submit'
    const bIsSubmit = bInfo?.attributes['type'] === 'submit'
    if (aIsSubmit && !bIsSubmit) return -1
    if (!aIsSubmit && bIsSubmit) return 1
    return a.label.length - b.label.length
  })

  return ctas.slice(0, maxCTAs)
}

function collectTextContentFromChildren(
  nodeId: string,
  vtree: VTree
): string | null {
  const node = vtree.nodes[nodeId]
  if (!node) return null

  if (isTextVNode(node)) {
    const val = node.get('value').orElse('')
    return val || null
  }

  if (isElementVNode(node)) {
    const children = node.get('children').orElse([]) as string[]
    const parts: string[] = []
    for (const childId of children) {
      const text = collectTextContentFromChildren(childId, vtree)
      if (text) parts.push(text)
    }
    if (parts.length === 0) return null
    return parts.join(' ')
  }

  return null
}

function collapseMobileSidebar(regions: LayoutRegion[]): void {
  for (const region of regions) {
    if (region.type === 'SIDEBAR') {
      const navName = region.name || 'navigation'
      region.type = '—'
      region.name = `sidebar collapsed: ${navName}`
      region.children = []
      region.ctas = []
    }
  }
}

// ─── Formatter ───────────────────────────────────────────────────────────────

/**
 * Format a LayoutSummary as plain text per the documented grammar.
 */
export function formatLayoutSummary(
  summary: LayoutSummary,
  options?: { showTokenEstimate?: boolean }
): string {
  const lines: string[] = []
  const showEstimate = options?.showTokenEstimate ?? false

  // Header
  lines.push(
    `LAYOUT SUMMARY — ${summary.framing} (detail: ${summary.detail}, viewport: ${summary.viewport[0]}×${summary.viewport[1]})`
  )
  lines.push('─'.repeat(60))

  // Regions
  for (const region of summary.regions) {
    formatRegion(region, 0, lines, summary)
  }

  lines.push('─'.repeat(60))

  // Token estimate
  if (showEstimate) {
    const rawText = lines.join('\n')
    const estimate = estimateTokenCount(rawText)
    lines.push(`[token estimate: ~${estimate}]`)
  }

  return lines.join('\n')
}

function formatRegion(
  region: LayoutRegion,
  depth: number,
  lines: string[],
  summary: LayoutSummary
): void {
  const indent = '  '.repeat(depth)
  const refPart = region.ref ? ` [ref=${region.ref}]` : ''
  const namePart = region.name ? ` "${region.name}"` : ''

  if (region.type === '—') {
    // Collapsed sidebar on mobile
    lines.push(`${indent}# — (${region.name}${refPart})`)
    return
  }

  // Region line
  lines.push(`${indent}# ${region.type}${namePart}${refPart}`)

  // CTAs at this level
  for (const cta of region.ctas) {
    lines.push(`${indent}  └─ CTA: "${cta.label}" [ref=${cta.ref}]`)
  }

  // Grid info
  if (region.gridInfo) {
    const gridRef = region.ref ? ` [ref=${region.ref}]` : ''
    lines.push(
      `${indent}  └─ GRID: ${region.gridInfo.columns} columns${gridRef}  (+${region.gridInfo.itemCount} items)`
    )
  }

  // Text hint
  if (region.textHint) {
    lines.push(`${indent}  └─ text: "${region.textHint}"`)
  }

  // Children
  for (const child of region.children) {
    formatRegion(child, depth + 1, lines, summary)
  }

  // Truncation marker
  if (region.truncatedChildCount && region.truncatedChildCount > 0) {
    const firstElided =
      region.children.length > 0
        ? region.children[region.children.length - 1]!.type.toLowerCase()
        : ''
    const childLabel = firstElided ? ` ${firstElided}` : ''
    lines.push(
      `${indent}  └─ (+${region.truncatedChildCount} more${childLabel})`
    )
  }
}
