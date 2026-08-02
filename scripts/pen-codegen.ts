#!/usr/bin/env node
// REP-1622: deterministic pen -> code CLI (design->code direction).
//
// Companion to scripts/pen-lint.ts (code->design). Translates screen
// compositions in repro.pen into React JSX code deterministically:
// every master instance (`ref` node) resolves to a concrete component via
// the package::ComponentName convention (REP-1618) — no LLM involvement.
//
// Output contract:
//   - Layout frames  -> jsxstyle primitives (Col / Row / Grid / Block)
//   - Text nodes     -> <Block component="p" ...> styled with design tokens
//   - Master refs    -> <Component prop="..."> with descendant overrides
//                       mapped through a slot-name table (Label -> children,
//                       Title -> title, Placeholder -> placeholder, ...)
//   - Token refs     -> $color-info -> color.info, $spacing-md -> spacing.md
//   - Unresolvable masters -> reported as violations with "did you mean?"
//     candidates; the tool exits non-zero when any are present.
//
// Modes:
//   - Default: read repro.pen, generate one .tsx per screen into
//     tmp/pen-codegen/, exit 0 when every master instance resolves.
//   - --screen <name>: only generate the named screen.
//   - --dry-run: print the JSON report to stdout, write no files.
//   - --catalog <path>: consume a pen-catalog.json for screens/variables
//     (pen-lint's artifact); the pen file still provides the screen trees.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { PenFile, PenNode } from './pen-lint.ts'
import {
  collectAllPackageExports,
  extractMasters,
  extractScreens,
  inferCandidates,
  parsePenJson,
  REPO_ROOT,
  resolvePackagePath,
  splitMasterName,
  validateMasterName,
} from './pen-lint.ts'

export const PEN_FILE = resolve(REPO_ROOT, 'repro.pen')
export const CATALOG_OUTPUT = resolve(REPO_ROOT, 'tmp/pen-catalog.json')
export const CODEGEN_OUTPUT_DIR = resolve(REPO_ROOT, 'tmp/pen-codegen')

// ---------------------------------------------------------------------------
// Token resolver
// ---------------------------------------------------------------------------

interface TokenPrefix {
  /** Pen variable prefix, e.g. "font-size" for $font-size-sm. */
  pen: string
  /** @repro/design token object export, e.g. "fontSize". */
  token: string
  /** Map a pen suffix to a token key (form-height-sm -> small). */
  suffixMap?: Record<string, string>
}

const TOKEN_PREFIXES: TokenPrefix[] = [
  { pen: 'color', token: 'color' },
  { pen: 'spacing', token: 'spacing' },
  { pen: 'font-size', token: 'fontSize' },
  { pen: 'font-weight', token: 'fontWeight' },
  { pen: 'line-height', token: 'lineHeight' },
  { pen: 'font-family', token: 'fontFamily' },
  { pen: 'font', token: 'fontFamily' },
  { pen: 'radius', token: 'radius' },
  { pen: 'shadow', token: 'shadow' },
  { pen: 'duration', token: 'duration' },
  {
    pen: 'form-height',
    token: 'formControlHeight',
    suffixMap: { sm: 'small', md: 'medium', lg: 'large' },
  },
].sort((a, b) => b.pen.length - a.pen.length)

/** Resolve a `$var` pen reference to a deterministic design-token expression. */
export function resolveVariableRef(
  ref: string,
  warnings?: string[]
): { ok: true; code: string; token: string } | { ok: false } {
  for (const prefix of TOKEN_PREFIXES) {
    if (ref.startsWith(`${prefix.pen}-`)) {
      let suffix = ref.slice(prefix.pen.length + 1)
      if (prefix.suffixMap && prefix.suffixMap[suffix]) {
        suffix = prefix.suffixMap[suffix]!
      }
      return {
        ok: true,
        code: renderTokenPath(prefix.token, suffix),
        token: prefix.token,
      }
    }
  }
  // Unknown prefixes fall back to the raw ref emitted as a quoted string.
  const target = warnings ?? []
  target.push(`unknown variable reference $${ref} — emitted as a raw string`)
  return { ok: false }
}

/** "text-default" -> ".text.default"; "2xl" -> "['2xl']" (bracket for non-idents). */
function renderTokenPath(token: string, suffix: string): string {
  const segments = suffix.split('-')
  const parts = segments.map(segment => {
    const isIdent = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(segment)
    return isIdent ? `.${segment}` : `['${segment}']`
  })
  return `${token}${parts.join('')}`
}

// ---------------------------------------------------------------------------
// Font / text helpers
// ---------------------------------------------------------------------------

const FONT_WEIGHT_TOKENS: Record<string, string> = {
  '100': 'thin',
  '200': 'extraLight',
  '300': 'light',
  '400': 'normal',
  '500': 'normal',
  normal: 'normal',
  '600': 'semibold',
  '700': 'bold',
  '800': 'extraBold',
  '900': 'black',
}

const LINE_HEIGHT_TOKENS: Record<number, string> = {
  0: 'none',
  1: 'tight',
  1.25: 'normal',
  1.5: 'relaxed',
}

/**
 * Composite textStyles presets (mirrors packages/design/src/tokens/typography.ts).
 * Keyed by the four font-token expressions each preset expands to, so a text
 * node whose resolved font props match a preset collapses into a spread.
 */
const TEXT_STYLE_PRESETS: Record<
  string,
  {
    fontFamily: string
    fontSize: string
    fontWeight: string
    lineHeight: string
  }
> = {
  display: {
    fontFamily: 'fontFamily.sans',
    fontSize: "fontSize['3xl']",
    fontWeight: 'fontWeight.bold',
    lineHeight: 'lineHeight.normal',
  },
  heading1: {
    fontFamily: 'fontFamily.sans',
    fontSize: "fontSize['2xl']",
    fontWeight: 'fontWeight.bold',
    lineHeight: 'lineHeight.normal',
  },
  heading2: {
    fontFamily: 'fontFamily.sans',
    fontSize: 'fontSize.xl',
    fontWeight: 'fontWeight.semibold',
    lineHeight: 'lineHeight.normal',
  },
  heading3: {
    fontFamily: 'fontFamily.sans',
    fontSize: 'fontSize.lg',
    fontWeight: 'fontWeight.semibold',
    lineHeight: 'lineHeight.normal',
  },
  heading4: {
    fontFamily: 'fontFamily.sans',
    fontSize: 'fontSize.md',
    fontWeight: 'fontWeight.semibold',
    lineHeight: 'lineHeight.normal',
  },
  heading5: {
    fontFamily: 'fontFamily.sans',
    fontSize: 'fontSize.sm',
    fontWeight: 'fontWeight.semibold',
    lineHeight: 'lineHeight.normal',
  },
  heading6: {
    fontFamily: 'fontFamily.sans',
    fontSize: 'fontSize.xs',
    fontWeight: 'fontWeight.semibold',
    lineHeight: 'lineHeight.normal',
  },
  body: {
    fontFamily: 'fontFamily.sans',
    fontSize: 'fontSize.md',
    fontWeight: 'fontWeight.normal',
    lineHeight: 'lineHeight.relaxed',
  },
  bodySmall: {
    fontFamily: 'fontFamily.sans',
    fontSize: 'fontSize.sm',
    fontWeight: 'fontWeight.normal',
    lineHeight: 'lineHeight.relaxed',
  },
  caption: {
    fontFamily: 'fontFamily.sans',
    fontSize: 'fontSize.xs',
    fontWeight: 'fontWeight.normal',
    lineHeight: 'lineHeight.relaxed',
  },
  label: {
    fontFamily: 'fontFamily.sans',
    fontSize: 'fontSize.sm',
    fontWeight: 'fontWeight.semibold',
    lineHeight: 'lineHeight.tight',
  },
  code: {
    fontFamily: 'fontFamily.mono',
    fontSize: 'fontSize.sm',
    fontWeight: 'fontWeight.normal',
    lineHeight: 'lineHeight.relaxed',
  },
  overline: {
    fontFamily: 'fontFamily.sans',
    fontSize: 'fontSize.xs',
    fontWeight: 'fontWeight.semibold',
    lineHeight: 'lineHeight.tight',
  },
}

// ---------------------------------------------------------------------------
// Master -> component resolution
// ---------------------------------------------------------------------------

export interface MasterResolution {
  ok: true
  pkg: string
  comp: string
}

export interface MasterResolutionFailure {
  ok: false
  candidates: string[]
}

/**
 * Map an inference result to the candidate list for a failure resolution:
 * exact matches win, otherwise the closest "did you mean?" tier.
 */
function failureCandidates(
  inference: ReturnType<typeof inferCandidates>
): string[] {
  if (inference.exact.length > 0) return inference.exact
  return inference.closest.map(c => `${c.package}::${c.component}`)
}

/**
 * Resolve a master name to a concrete @repro/<pkg> export. Conforming
 * package::ComponentName masters resolve exactly; anything else falls back
 * to inferCandidates (REP-1618's "did you mean?" model).
 */
export function resolveMasterComponent(
  masterName: string,
  exportsByPackage: Map<string, Set<string>>
): MasterResolution | MasterResolutionFailure {
  if (validateMasterName(masterName)) {
    const [pkg, comp] = splitMasterName(masterName)
    if (resolvePackagePath(pkg) && exportsByPackage.get(pkg)?.has(comp)) {
      return { ok: true, pkg, comp }
    }
    // The master explicitly names a package but that package does not export
    // the component. Never auto-resolve to a different package (the explicit
    // namespace wins) — report the closest candidates so the author can fix
    // the name, using the same "did you mean?" model as REP-1618.
    return {
      ok: false,
      candidates: failureCandidates(
        inferCandidates(masterName, exportsByPackage)
      ),
    }
  }
  // Unprefixed master: fall back to inference (REP-1618 "did you mean?").
  const inference = inferCandidates(masterName, exportsByPackage)
  if (inference.exact.length === 1) {
    const [pkg, comp] = splitMasterName(inference.exact[0]!)
    return { ok: true, pkg, comp }
  }
  return { ok: false, candidates: failureCandidates(inference) }
}

// ---------------------------------------------------------------------------
// Slot mapping for descendant overrides
// ---------------------------------------------------------------------------

/**
 * Map a master text node's name to the React prop its content override
 * becomes. v1 heuristic (REP-1622 plan): Label/Text/Body/Message/Content are
 * the primary children; named slots (Title, Description, Placeholder, ...)
 * become named props. The map grows incrementally per master.
 */
const SLOT_PROP_MAP: Record<string, string> = {
  Label: 'children',
  Text: 'children',
  Body: 'children',
  Message: 'children',
  Content: 'children',
  Title: 'title',
  Subtitle: 'subtitle',
  Description: 'description',
  Placeholder: 'placeholder',
  Help: 'helpText',
  Value: 'value',
  Error: 'error',
  Legend: 'legend',
}

const DEFAULT_SLOT_PROP = 'children'

// ---------------------------------------------------------------------------
// Layout heuristic
// ---------------------------------------------------------------------------

/** Map a pen frame's layout to a jsxstyle primitive. */
export function layoutTagFor(node: PenNode): string {
  const layout = node.layout
  if (layout === 'vertical') return 'Col'
  if (layout === 'grid') return 'Grid'
  if (layout === 'horizontal') return 'Row'
  return 'Block'
}

/** Magic pen width/height values -> CSS values. */
const MAGIC_SIZE_VALUES: Record<string, string> = {
  fill_container: '100%',
  fit_content: 'auto',
}

// ---------------------------------------------------------------------------
// Codegen context + value rendering
// ---------------------------------------------------------------------------

export interface CodegenViolation {
  screenId: string
  screenName: string
  refId: string
  masterName: string
  reason: string
  candidates: string[]
}

export interface RenderContext {
  masterNodeById: Map<string, PenNode>
  exportsByPackage: Map<string, Set<string>>
  violations: CodegenViolation[]
  warnings: string[]
  designImports: Set<string>
  jsxstyleImports: Set<string>
  screenId: string
  screenName: string
}

/** Escape arbitrary text for safe inclusion as a JS string literal. */
function jsString(value: string): string {
  return JSON.stringify(value)
}

/** Render a pen value (number | string | array) as a JSX prop expression. */
function renderValue(value: unknown, ctx: RenderContext): string {
  if (value === null) return 'null'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return String(value)
  if (typeof value === 'string') {
    if (value.startsWith('$')) {
      const resolved = resolveVariableRef(value.slice(1), ctx.warnings)
      if (resolved.ok) {
        ctx.designImports.add(resolved.token)
        return resolved.code
      }
      return jsString(value)
    }
    const magic = MAGIC_SIZE_VALUES[value]
    if (magic !== undefined) return jsString(magic)
    return jsString(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map(item => renderValue(item, ctx)).join(', ')}]`
  }
  return jsString(String(value))
}

/** Map a pen style key to a jsxstyle prop name (fill -> backgroundColor...). */
function stylePropForKey(key: string): string | null {
  switch (key) {
    case 'fill':
      return 'backgroundColor'
    case 'stroke':
      return 'borderColor'
    case 'strokeWidth':
      return 'borderWidth'
    case 'cornerRadius':
      return 'borderRadius'
    default:
      return key
  }
}

const FRAME_PROP_KEYS = [
  'gap',
  'padding',
  'justifyContent',
  'alignItems',
  'width',
  'height',
  'fill',
  'stroke',
  'strokeWidth',
  'cornerRadius',
] as const

/** Extract deterministic jsxstyle props from a frame/ref node. */
function extractLayoutProps(node: PenNode, ctx: RenderContext): string[] {
  const props: string[] = []
  for (const key of FRAME_PROP_KEYS) {
    const raw = node[key]
    if (raw === undefined) continue
    const propName = stylePropForKey(key)
    if (!propName) continue
    // Per-side strokeWidth objects ({left: 4}) are not expressible in v1.
    if (key === 'strokeWidth' && typeof raw === 'object') continue
    props.push(`${propName}={${renderValue(raw, ctx)}}`)
  }
  return props.sort()
}

// ---------------------------------------------------------------------------
// Node rendering
// ---------------------------------------------------------------------------

/** Wrap an opening tag, child lines, and closing tag into an element string. */
function element(
  tag: string,
  props: string[],
  children: string[] | null,
  indent: number
): string {
  const pad = '  '.repeat(indent)
  const propText = props.length > 0 ? ` ${props.join(' ')}` : ''
  if (!children || children.length === 0) {
    return `${pad}<${tag}${propText} />`
  }
  return [`${pad}<${tag}${propText}>`, ...children, `${pad}</${tag}>`].join(
    '\n'
  )
}

/** Resolve a font prop (fontFamily/fontSize/fontWeight/lineHeight) to a token expr. */
function resolveFontProp(
  key: string,
  value: unknown,
  ctx: RenderContext
): string | null {
  if (typeof value === 'string' && value.startsWith('$')) {
    const resolved = resolveVariableRef(value.slice(1), ctx.warnings)
    if (resolved.ok) {
      ctx.designImports.add(resolved.token)
      return resolved.code
    }
    return null
  }
  if (key === 'fontWeight' && typeof value === 'string') {
    const token = FONT_WEIGHT_TOKENS[value]
    if (token) {
      ctx.designImports.add('fontWeight')
      return `fontWeight.${token}`
    }
  }
  if (key === 'lineHeight' && typeof value === 'number') {
    const token = LINE_HEIGHT_TOKENS[value]
    if (token !== undefined) {
      ctx.designImports.add('lineHeight')
      return `lineHeight.${token}`
    }
  }
  return null
}

/** Translate a pen text node into a styled jsxstyle Block. */
export function renderTextNode(
  node: PenNode,
  indent: number,
  ctx: RenderContext
): string {
  const props: string[] = []
  if (typeof node.fill === 'string') {
    // Token refs resolve to design tokens; raw values (hex, named colors)
    // become literal color props rather than being silently dropped.
    const isTokenRef = node.fill.startsWith('$')
    const resolved = isTokenRef
      ? resolveVariableRef(node.fill.slice(1), ctx.warnings)
      : null
    if (resolved?.ok) {
      ctx.designImports.add(resolved.token)
      props.push(`color={${resolved.code}}`)
    } else {
      props.push(`color={${jsString(node.fill)}}`)
    }
  }

  const fontProps: Partial<Record<string, string>> = {}
  for (const key of [
    'fontFamily',
    'fontSize',
    'fontWeight',
    'lineHeight',
  ] as const) {
    const raw = node[key]
    if (raw === undefined) continue
    const resolved = resolveFontProp(key, raw, ctx)
    if (resolved) fontProps[key] = resolved
  }

  const preset = matchTextStylePreset(fontProps)
  if (preset) {
    ctx.designImports.add('textStyles')
    props.push(`{...textStyles.${preset}}`)
  } else {
    for (const key of [
      'fontFamily',
      'fontSize',
      'fontWeight',
      'lineHeight',
    ] as const) {
      const resolved = fontProps[key]
      if (resolved) {
        props.push(`${key}={${resolved}}`)
      } else if (typeof node[key] === 'number') {
        props.push(`${key}={${node[key]}}`)
      } else if (typeof node[key] === 'string') {
        props.push(`${key}={${jsString(node[key])}}`)
      }
    }
  }

  props.push('component="p"')
  props.sort()

  const content = typeof node.content === 'string' ? node.content : ''
  const childLine = `${'  '.repeat(indent + 1)}{${jsString(content)}}`
  return element('Block', props, [childLine], indent)
}

/** True when the four resolved font props exactly match one textStyles preset. */
function matchTextStylePreset(
  fontProps: Partial<Record<string, string>>
): string | null {
  const { fontFamily, fontSize, fontWeight, lineHeight } = fontProps
  if (!fontFamily || !fontSize || !fontWeight || !lineHeight) return null
  for (const [name, preset] of Object.entries(TEXT_STYLE_PRESETS)) {
    if (
      preset.fontFamily === fontFamily &&
      preset.fontSize === fontSize &&
      preset.fontWeight === fontWeight &&
      preset.lineHeight === lineHeight
    ) {
      return name
    }
  }
  return null
}

/** Find a node by id within a single tree (masters' own children only). */
function findNodeById(root: PenNode, id: string): PenNode | null {
  if (!Array.isArray(root.children)) return null
  const stack = [...root.children]
  while (stack.length > 0) {
    const node = stack.pop()!
    if (node.id === id) return node
    if (Array.isArray(node.children)) stack.push(...node.children)
  }
  return null
}

interface DescendantTarget {
  type: string
  name: string
}

/**
 * Resolve a descendant override key to the node it names inside a master.
 * Keys are either a plain node id ("SKrlh") or a nested ref path
 * ("w9QiD/CogW2" — ref id in the master + node id inside that ref's master).
 */
export function resolveDescendantTarget(
  masterNode: PenNode,
  key: string,
  masterNodeById: Map<string, PenNode>
): DescendantTarget | null {
  let target: PenNode | null
  if (key.includes('/')) {
    const slash = key.indexOf('/')
    const refId = key.slice(0, slash)
    const childId = key.slice(slash + 1)
    const refNode = findNodeById(masterNode, refId)
    if (!refNode || refNode.type !== 'ref') return null
    const refMaster = masterNodeById.get(String(refNode.ref))
    if (!refMaster) return null
    target = findNodeById(refMaster, childId)
  } else {
    target = findNodeById(masterNode, key)
  }
  if (!target) return null
  return { type: String(target.type), name: String(target.name) }
}

/** Translate a master instance (`ref` node) into a component element. */
export function renderRefNode(
  node: PenNode,
  indent: number,
  ctx: RenderContext
): string | null {
  const masterNode = ctx.masterNodeById.get(String(node.ref))
  if (!masterNode) {
    ctx.violations.push({
      screenId: ctx.screenId,
      screenName: ctx.screenName,
      refId: node.id,
      masterName: String(node.name),
      reason: `ref references unknown master "${node.ref}"`,
      candidates: [],
    })
    return null
  }
  const masterName = String(masterNode.name)
  const resolution = resolveMasterComponent(masterName, ctx.exportsByPackage)
  if (!resolution.ok) {
    ctx.violations.push({
      screenId: ctx.screenId,
      screenName: ctx.screenName,
      refId: node.id,
      masterName,
      reason:
        resolution.candidates.length > 0
          ? `master "${masterName}" has no matching component export — did you mean ${resolution.candidates
              .map(c => `\`${c}\``)
              .join(', ')}?`
          : `master "${masterName}" has no matching component export`,
      candidates: resolution.candidates,
    })
    return null
  }
  ctx.designImports.add(resolution.comp)

  const props = extractLayoutProps(node, ctx)
  const children: string[] = []

  const descendants =
    node.descendants && typeof node.descendants === 'object'
      ? (node.descendants as Record<string, unknown>)
      : {}
  for (const [key, override] of Object.entries(descendants).sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    if (!override || typeof override !== 'object') continue
    const target = resolveDescendantTarget(masterNode, key, ctx.masterNodeById)
    if (!target) continue

    const overrides = override as Record<string, unknown>
    // Full node replacement (frame subtree / ref / icon) -> render in place.
    // Replaces may omit `type` and carry only a `children` array.
    const isNodeReplacement =
      Array.isArray(overrides.children) ||
      (typeof overrides.type === 'string' &&
        overrides.type !== 'text' &&
        overrides.type !== 'icon')
    if (isNodeReplacement) {
      const rendered = renderNode(overrides as PenNode, indent + 1, ctx)
      if (rendered) children.push(rendered)
      continue
    }

    // Text content override -> slot prop (children or named prop).
    if (target.type === 'text' && overrides.content !== undefined) {
      const slotProp = SLOT_PROP_MAP[target.name] ?? DEFAULT_SLOT_PROP
      const content = String(overrides.content)
      if (slotProp === 'children') {
        children.push(`${'  '.repeat(indent + 1)}{${jsString(content)}}`)
      } else {
        props.push(`${slotProp}={${jsString(content)}}`)
      }
      continue
    }

    // Disabled slots produce nothing in v1 (e.g. PageFrame Actions disabled).
    if (overrides.enabled === false) continue
    // Remaining scalar overrides (fill/stroke/icon/x/y/...) are cosmetic
    // details of the master's internal rendering — skipped deterministically.
  }

  props.sort()
  return element(
    resolution.comp,
    props,
    children.length > 0 ? children : null,
    indent
  )
}

/** Translate a pen frame into a jsxstyle layout primitive and recurse. */
export function renderFrameNode(
  node: PenNode,
  indent: number,
  ctx: RenderContext
): string {
  const tag = layoutTagFor(node)
  ctx.jsxstyleImports.add(tag)
  const props = extractLayoutProps(node, ctx)
  const children: string[] = []
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      const rendered = renderNode(child, indent + 1, ctx)
      if (rendered) children.push(rendered)
    }
  }
  return element(tag, props, children.length > 0 ? children : null, indent)
}

/**
 * Recursive tree walker: frames become jsxstyle layouts, refs become
 * components, text nodes become styled text, decorative nodes are skipped.
 */
export function renderNode(
  node: PenNode,
  indent: number,
  ctx: RenderContext
): string | null {
  switch (node.type) {
    case 'frame':
      return renderFrameNode(node, indent, ctx)
    case 'ref':
      return renderRefNode(node, indent, ctx)
    case 'text':
      return renderTextNode(node, indent, ctx)
    default:
      // Decorative nodes (icon / ellipse / rectangle) are skipped. A bare
      // children-array replacement that omits `type` still renders as a frame.
      if (Array.isArray(node.children)) {
        return renderFrameNode(node, indent, ctx)
      }
      return null
  }
}

// ---------------------------------------------------------------------------
// Screen code generation
// ---------------------------------------------------------------------------

/** "Settings Form" -> "SettingsFormScreen". */
export function screenComponentName(normalizedName: string): string {
  const parts = normalizedName.split(/[^A-Za-z0-9]+/).filter(Boolean)
  const pascal = parts
    .map(part => part[0]!.toUpperCase() + part.slice(1))
    .join('')
  return `${pascal}Screen`
}

/** Lowercase, no colons — safe output filename for a screen. */
export function sanitizeFileName(name: string): string {
  const sanitized = name
    .replaceAll(':', '')
    .replaceAll(/\s+/g, '-')
    .toLowerCase()
    .replaceAll(/[^a-z0-9-]/g, '')
  // A name made entirely of stripped characters (e.g. "!!!###") must still
  // produce a usable filename instead of an empty string.
  return sanitized.length > 0 ? sanitized : 'unnamed-screen'
}

function collectImports(ctx: RenderContext): string[] {
  const lines: string[] = []
  lines.push(`import React from 'react'`)
  if (ctx.jsxstyleImports.size > 0) {
    const names = [...ctx.jsxstyleImports].sort()
    lines.push(`import { ${names.join(', ')} } from '@jsxstyle/react'`)
  }
  if (ctx.designImports.size > 0) {
    const designNames = [...ctx.designImports].sort()
    lines.push(`import { ${designNames.join(', ')} } from '@repro/design'`)
  }
  return lines
}

export interface ScreenCode {
  screenId: string
  screenName: string
  normalizedName: string
  componentName: string
  code: string
  imports: string[]
  violations: CodegenViolation[]
  warnings: string[]
}

/**
 * Generate the full .tsx source for one screen: imports (sorted), the
 * exported component, and the rendered root frame tree.
 */
export function generateScreenCode(
  pen: PenFile,
  screen: { id: string; name: string; normalizedName: string },
  ctx: RenderContext
): ScreenCode {
  const root = pen.children.find(child => child.id === screen.id)
  if (!root || root.type !== 'frame') {
    throw new Error(
      `screen ${screen.id} "${screen.name}" is not a top-level frame`
    )
  }
  const rootElement = renderFrameNode(root, 2, ctx)
  const componentName = screenComponentName(screen.normalizedName)
  const body = [
    `export const ${componentName} = () => {`,
    `  return (`,
    rootElement,
    `  )`,
    `}`,
  ].join('\n')

  const imports = collectImports(ctx)
  const code = [
    `// Generated by scripts/pen-codegen.ts (REP-1622). Do not edit by hand.`,
    `// Source: repro.pen -> screen "${screen.name}" (${screen.id}).`,
    '',
    ...imports,
    '',
    body,
    '',
  ].join('\n')

  return {
    screenId: screen.id,
    screenName: screen.name,
    normalizedName: screen.normalizedName,
    componentName,
    code,
    imports,
    violations: ctx.violations,
    warnings: ctx.warnings,
  }
}

// ---------------------------------------------------------------------------
// CLI interface
// ---------------------------------------------------------------------------

export interface CodegenOptions {
  penFile?: string
  catalogOutput?: string
  outputDir?: string
  screen?: string
  dryRun?: boolean
  log?: (msg: string) => void
  jsonOut?: (json: string) => void
  /** Injectable package export map; defaults to a full repo scan. */
  exportsByPackage?: Map<string, Set<string>>
}

export interface CodegenReport {
  mode: 'codegen'
  clean: boolean
  screenCount: number
  violations: CodegenViolation[]
  warnings: string[]
  output: Array<{ screen: string; file: string }>
}

export function runCodegen(options: CodegenOptions = {}): number {
  const penFile = options.penFile ?? PEN_FILE
  const outputDir = options.outputDir ?? CODEGEN_OUTPUT_DIR
  const log = options.log ?? ((msg: string) => console.error(msg))
  const jsonOut = options.jsonOut ?? ((json: string) => console.log(json))

  let pen: PenFile
  try {
    pen = parsePenJson(readFileSync(penFile, 'utf8'))
  } catch (err) {
    log(`ERROR: failed to read or parse ${penFile}: ${String(err)}`)
    return 1
  }

  // The catalog (pen-lint's artifact) is the optional screens source; the
  // pen file always provides the screen trees.
  let screens = extractScreens(pen)
  if (options.catalogOutput && existsSync(options.catalogOutput)) {
    try {
      const catalog = JSON.parse(
        readFileSync(options.catalogOutput, 'utf8')
      ) as {
        screens?: Array<{ id: string; name: string }>
      }
      if (Array.isArray(catalog.screens) && catalog.screens.length > 0) {
        screens = catalog.screens.map(screen => ({
          id: screen.id,
          name: screen.name,
          normalizedName: screen.name.replace(/^Screen: /, ''),
        }))
      }
    } catch (err) {
      log(
        `warning: failed to read catalog ${options.catalogOutput}: ${String(
          err
        )}`
      )
    }
  }

  const masters = extractMasters(pen)
  const masterNodeById = new Map<string, PenNode>()
  for (const master of masters) {
    const node = pen.children.find(child => child.id === master.id)
    if (node) masterNodeById.set(master.id, node)
  }
  const exportsByPackage =
    options.exportsByPackage ?? collectAllPackageExports()

  if (options.screen) {
    const match = screens.find(
      s =>
        s.normalizedName === options.screen ||
        s.name === options.screen ||
        s.id === options.screen
    )
    if (!match) {
      log(
        `ERROR: no screen matches "${
          options.screen
        }". Available screens: ${screens.map(s => s.normalizedName).join(', ')}`
      )
      return 1
    }
    screens = [match]
  }

  const allViolations: CodegenViolation[] = []
  const allWarnings: string[] = []
  const output: Array<{ screen: string; file: string }> = []

  if (!options.dryRun) mkdirSync(outputDir, { recursive: true })

  // Track sanitized output filenames so two screens that normalize to the
  // same file (e.g. "Screen: Demo" and "screen demo") are reported instead
  // of silently overwriting one another.
  const seenFilenames = new Set<string>()

  for (const screen of screens) {
    const fileName = sanitizeFileName(screen.name)
    if (seenFilenames.has(fileName)) {
      allViolations.push({
        screenId: screen.id,
        screenName: screen.name,
        refId: screen.id,
        masterName: screen.name,
        reason: `screen name "${screen.name}" sanitizes to "${fileName}.tsx", which collides with another screen's output file`,
        candidates: [],
      })
      continue
    }
    seenFilenames.add(fileName)

    const ctx: RenderContext = {
      masterNodeById,
      exportsByPackage,
      violations: [],
      warnings: [],
      designImports: new Set(),
      jsxstyleImports: new Set(),
      screenId: screen.id,
      screenName: screen.name,
    }
    const generated = generateScreenCode(pen, screen, ctx)
    allViolations.push(...generated.violations)
    allWarnings.push(...generated.warnings)

    if (options.dryRun) {
      log(
        `dry-run: generated ${generated.componentName} (${generated.violations.length} violation(s))`
      )
      continue
    }
    const file = resolve(outputDir, `${fileName}.tsx`)
    writeFileSync(file, generated.code)
    output.push({ screen: screen.name, file })
    log(`Generated ${generated.componentName} -> ${file}`)
  }

  const report: CodegenReport = {
    mode: 'codegen',
    clean: allViolations.length === 0,
    screenCount: screens.length,
    violations: allViolations,
    warnings: allWarnings,
    output,
  }
  jsonOut(JSON.stringify(report, null, 2))

  if (allViolations.length > 0) {
    for (const violation of allViolations) {
      log(
        `violation: screen ${violation.screenName} ref ${violation.refId}: ${violation.reason}`
      )
    }
    return 1
  }
  log(
    `pen-codegen: generated ${screens.length} screen(s) — all master instances resolved.`
  )
  return 0
}

function printUsage(): void {
  console.error(`pen-codegen — deterministic pen -> code sync (REP-1622)

Usage:
  tsx scripts/pen-codegen.ts                  Generate one .tsx per screen from
                                              repro.pen into tmp/pen-codegen/.
                                              Exit non-zero on unmappable masters.
  tsx scripts/pen-codegen.ts --screen <name>  Only generate the named screen
                                              (normalized name, raw name, or id).
  tsx scripts/pen-codegen.ts --pen-file <p>   Use <p> instead of repro.pen.
  tsx scripts/pen-codegen.ts --output <dir>   Write generated files to <dir>
                                              (default tmp/pen-codegen).
  tsx scripts/pen-codegen.ts --catalog <path> Consume a pen-catalog.json for
                                              screens/variables (optional).
  tsx scripts/pen-codegen.ts --dry-run        Print the JSON report to stdout,
                                              write no files.
  tsx scripts/pen-codegen.ts --help           Show this help.

Exit codes:
  0  all master instances resolved
  1  unmappable instances (violations) or usage error

JSON contract (--dry-run / default):
  { "mode": "codegen", "clean": bool, "screenCount": n,
    "violations": [ { "screenId", "screenName", "refId", "masterName",
      "reason", "candidates" } ],
    "warnings": [ ... ], "output": [ { "screen", "file" } ] }`)
}

export interface CliParseResult {
  options: CodegenOptions
  error?: string
}

/** Human-readable description of each value-taking flag's expected value. */
const FLAG_VALUE_DESCRIPTIONS: Record<string, string> = {
  '--screen': 'screen name, normalized name, or id',
  '--pen-file': 'path to a .pen file',
  '--output': 'output directory',
  '--catalog': 'path to a pen-catalog.json',
}

/**
 * Parse CLI args into CodegenOptions; returns an error for malformed usage.
 *
 * Args are scanned left-to-right so a flag always consumes the immediately
 * following token as its value. A value that is itself a flag name
 * (`--screen --dry-run`) or a missing value (`--output` at end) is rejected
 * instead of being silently accepted — for all four value-taking flags.
 */
export function parseCliArgs(args: string[]): CliParseResult {
  const options: CodegenOptions = {}
  const assigners: Record<string, (value: string) => void> = {
    '--screen': value => {
      options.screen = value
    },
    '--pen-file': value => {
      options.penFile = value
    },
    '--output': value => {
      options.outputDir = value
    },
    '--catalog': value => {
      options.catalogOutput = value
    },
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!
    const assign = assigners[arg]
    if (assign) {
      const value = args[i + 1]
      if (value === undefined) {
        return {
          options,
          error: `${arg} requires a value (${
            FLAG_VALUE_DESCRIPTIONS[arg] ?? 'a value'
          })`,
        }
      }
      if (value.startsWith('--')) {
        return {
          options,
          error: `${arg} value "${value}" looks like another flag; expected ${
            FLAG_VALUE_DESCRIPTIONS[arg] ?? 'a value'
          }`,
        }
      }
      assign(value)
      i++
      continue
    }
    if (arg === '--dry-run') {
      options.dryRun = true
      continue
    }
    return { options, error: `unknown argument "${arg}"` }
  }
  return { options }
}

const isDirectRun =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isDirectRun) {
  const args = process.argv.slice(2)
  if (args.includes('--help') || args.includes('-h')) {
    printUsage()
    process.exit(0)
  }
  const { options, error } = parseCliArgs(args)
  if (error) {
    console.error(`ERROR: ${error}`)
    printUsage()
    process.exit(1)
  }
  process.exit(runCodegen(options))
}
