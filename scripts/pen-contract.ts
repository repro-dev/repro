#!/usr/bin/env node
// REP-1622: pen design-intent contract generator (design -> agentic-apply).
//
// Reads repro.pen and emits a deterministic design-intent CONTRACT to stdout
// (never writes files). The contract is the detection layer: it resolves
// every master instance to a concrete @repro/<pkg> export from the group
// path (masters/<pkg>/<Component>), extracts presentational props from a
// closed per-master override vocabulary (v1: Button, Alert), groups screens
// into state families, and reports unresolved instances with "did you
// mean?" candidates. The agentic apply step (REP-1394) consumes the
// contract; how the agent wires state is advisory, not emitted.
//
// Determinism: same input -> byte-identical contract. No clock reads, no
// filesystem writes, no pen CLI dependency (bin/pen requires PEN_CLI_KEY
// auth, which would break agent CI runs).
//
// Flags:
//   --screen <name>   emit the contract for one screen only
//   --pen-file <p>    use <p> instead of repro.pen
//   --html            emit a self-contained HTML scaffold derived from the
//                     contract (screen composition: resolved masters, props,
//                     state) instead of JSON
//   --dry-run         validate-only; identical output to a normal run (the
//                     tool never writes files). Used by pen:contract:check.
//   --help            show usage
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { PenFile, PenNode, ScreenState } from './pen-lint.ts'
import {
  collectAllPackageExports,
  extractMasters,
  extractScreens,
  extractStateFamilies,
  findNodeByIdRecursive,
  parsePenJson,
  REPO_ROOT,
  resolveMasterFromPath,
  validateFamilyStateAggregates,
  validateScreenStateMetadata,
} from './pen-lint.ts'

export const PEN_FILE = resolve(REPO_ROOT, 'repro.pen')

// ---------------------------------------------------------------------------
// Contract schema (v1, stable)
// ---------------------------------------------------------------------------

export interface ContractViolation {
  /**
   * Null for family-scoped violations (no single screen is responsible);
   * per-screen violations carry the id. Never an empty-string sentinel.
   */
  screenId: string | null
  screenName: string | null
  refId?: string
  masterName?: string
  reason: string
  candidates: string[]
}

export interface ResolvedComponent {
  package: string
  export: string
  import: string
}

export interface ContractTreeNode {
  type: string
  id?: string
  name?: string
  masterId?: string
  component?: ResolvedComponent
  presentationalOverrides?: Record<string, unknown>
  violations?: ContractViolation[]
  content?: string
  children?: ContractTreeNode[]
}

export interface ContractScreen {
  screenId: string
  screenName: string
  groupPath: string
  stateFamily?: string
  state?: string
  tree: ContractTreeNode
}

export interface ContractStateFamily {
  family: string
  states: Partial<Record<ScreenState, { screenId: string; screenName: string }>>
}

export interface PenContract {
  mode: 'contract'
  penVersion: string
  clean: boolean
  screenCount: number
  screens: ContractScreen[]
  stateFamilies: ContractStateFamily[]
  violations: ContractViolation[]
  warnings: string[]
}

// ---------------------------------------------------------------------------
// Closed override vocabulary (v1)
// ---------------------------------------------------------------------------

export interface OverrideResolution {
  props: Record<string, unknown>
  warnings: string[]
}

const STRUCTURAL_KEYS = new Set([
  'type',
  'id',
  'name',
  'ref',
  'children',
  'descendants',
])

/** Canvas-cosmetic keys never warned about (layout/position, not presentation). */
const CANVAS_KEYS = new Set([
  'x',
  'y',
  'width',
  'height',
  'layout',
  'clip',
  'overflow',
])

/** Button fill token -> context prop (default 'info' is omitted). */
const BUTTON_CONTEXT_FROM_TOKEN: Record<string, string> = {
  '$color-info': 'info',
  '$color-success': 'success',
  '$color-warning-emphasis': 'warning',
  '$color-danger': 'danger',
  '$color-neutral': 'neutral',
}

/** Button height -> size prop (default 'medium' is omitted). */
const BUTTON_SIZE_FROM_HEIGHT: Record<number, string> = {
  28: 'small',
  36: 'medium',
  44: 'large',
}

/** Keys the Button resolver consumes (mapped or part of variant detection). */
const BUTTON_MAPPED_KEYS = new Set([
  'fill',
  'stroke',
  'strokeWidth',
  'strokeAlignment',
  'effect',
  'height',
  'gap',
  'padding',
  'cornerRadius',
  'opacity',
])

/** Alert tint fill -> type prop (default 'info' is omitted). */
const ALERT_TYPE_FROM_TINT: Record<string, string> = {
  '$color-info-tint': 'info',
  '$color-success-tint': 'success',
  '$color-warning-tint': 'warning',
  '$color-danger-tint': 'danger',
}

/**
 * REP-1629: Alert solid (non-tint) fill -> type prop for the Icon/Message
 * descendant accents. Idempotent with ALERT_TYPE_FROM_TINT — both map to the
 * same `type` prop; the last one seen wins when both are present.
 */
const ALERT_TYPE_FROM_SOLID: Record<string, string> = {
  '$color-info': 'info',
  '$color-success': 'success',
  '$color-warning': 'warning',
  '$color-danger': 'danger',
}

/** Keys the Alert resolver consumes. */
const ALERT_MAPPED_KEYS = new Set([
  'fill',
  'stroke',
  'strokeWidth',
  'strokeAlignment',
  'gap',
  'padding',
  'cornerRadius',
])

function unmappedWarnings(
  own: Record<string, unknown>,
  mappedKeys: Set<string>,
  label: string
): string[] {
  const warnings: string[] = []
  for (const key of Object.keys(own)) {
    if (STRUCTURAL_KEYS.has(key)) continue
    if (CANVAS_KEYS.has(key)) continue
    if (mappedKeys.has(key)) continue
    const value = own[key]
    warnings.push(
      `${label}: unmapped override "${key}"${
        value === undefined ? '' : `=${JSON.stringify(value)}`
      }`
    )
  }
  return warnings
}

/** Button v1 vocabulary: fill->context, transparent+stroke+effect->variant, height/gap/padding/cornerRadius->size. */
function resolveButtonOwnOverrides(ref: PenNode): OverrideResolution {
  const own = ref as Record<string, unknown>
  const props: Record<string, unknown> = {}
  const warnings: string[] = []

  const fill = typeof own.fill === 'string' ? own.fill : undefined
  const stroke = typeof own.stroke === 'string' ? own.stroke : undefined
  const isTransparent = fill === '#00000000'
  if (isTransparent) {
    const hasStroke =
      typeof stroke === 'string' &&
      stroke !== '#00000000' &&
      stroke !== 'transparent'
    props.variant = hasStroke ? 'outlined' : 'text'
  }
  if (fill && fill.startsWith('$')) {
    const context = BUTTON_CONTEXT_FROM_TOKEN[fill]
    if (context !== undefined && context !== 'info') props.context = context
  } else if (fill && !isTransparent) {
    warnings.push(`Button: unmapped override "fill"=${JSON.stringify(fill)}`)
  }
  if (typeof own.height === 'number') {
    const size = BUTTON_SIZE_FROM_HEIGHT[own.height]
    if (size !== undefined && size !== 'medium') props.size = size
  }
  // REP-1629: Button renders opacity={disabled ? 0.5 : 1} (Button.tsx), so a
  // 0.5 opacity own override encodes the disabled state. Any other opacity
  // value is out of vocabulary and warns (value validation).
  if (own.opacity !== undefined) {
    if (own.opacity === 0.5) {
      props.disabled = true
    } else {
      warnings.push(
        `Button: unmapped override "opacity"=${JSON.stringify(own.opacity)}`
      )
    }
  }

  for (const warning of unmappedWarnings(own, BUTTON_MAPPED_KEYS, 'Button')) {
    warnings.push(warning)
  }
  return { props, warnings }
}

/** Alert v1 vocabulary: tint/border->type, message content->children. */
function resolveAlertOwnOverrides(ref: PenNode): OverrideResolution {
  const own = ref as Record<string, unknown>
  const props: Record<string, unknown> = {}
  const warnings: string[] = []

  const fill = typeof own.fill === 'string' ? own.fill : undefined
  if (fill && fill.startsWith('$')) {
    const type = ALERT_TYPE_FROM_TINT[fill]
    if (type !== undefined && type !== 'info') props.type = type
  } else if (fill) {
    warnings.push(`Alert: unmapped override "fill"=${JSON.stringify(fill)}`)
  }

  for (const warning of unmappedWarnings(own, ALERT_MAPPED_KEYS, 'Alert')) {
    warnings.push(warning)
  }
  return { props, warnings }
}

/**
 * Remaining override keys on a handled descendant override (mapped or
 * absorbed keys excluded). Emits the v1 `-> "key"` warning shape so the
 * consumer can tell exactly which key on a resolved descendant is unmapped.
 */
function warnRemaining(
  overrides: Record<string, unknown>,
  handled: Set<string>,
  label: string,
  key: string
): string[] {
  const warnings: string[] = []
  for (const k of Object.keys(overrides)) {
    if (handled.has(k) || STRUCTURAL_KEYS.has(k) || CANVAS_KEYS.has(k)) {
      continue
    }
    warnings.push(`${label}: unmapped descendant override "${key}" -> "${k}"`)
  }
  return warnings
}

/** Vocabulary resolver for masters whose gallery instances carry no own overrides. */
const NO_OWN_OVERRIDES = (): OverrideResolution => ({ props: {}, warnings: [] })

// ---------------------------------------------------------------------------
// REP-1629 vocabulary growth (v2). Each master below documents its raw
// override -> semantic prop mapping table (AC2 deliverable); keys listed as
// "absorbed" are component-owned cosmetics that intentionally do not map.
// ---------------------------------------------------------------------------

/**
 * Checkbox (repro.pen master dDpF6). Raw override -> semantic prop:
 *
 * | descendant target | raw override           | prop              |
 * | ----------------- | ---------------------- | ----------------- |
 * | Box (sa63x)       | fill:$color-primary    | checked: true     |
 * |                   |   + strokeWidth: 0     |   (part of encoding) |
 * | Check (p2muX)     | enabled: true          | checked: true     |
 * | Label (AXIyz)     | content                | label             |
 *
 * Absorbed cosmetic keys: Box `strokeWidth` (always 0 in the checked
 * encoding); Check `enabled` (the check icon is hidden by default in the
 * master; enabling it encodes the checked state).
 */
function resolveCheckboxDescendant(
  key: string,
  target: DescendantTarget,
  overrides: Record<string, unknown>
): OverrideResolution | undefined {
  if (target.name === 'Box') {
    const props: Record<string, unknown> = {}
    const warnings: string[] = []
    if (overrides.fill === '$color-primary') {
      props.checked = true
    } else if (overrides.fill !== undefined) {
      warnings.push(
        `Checkbox: unmapped descendant override "${key}" -> "fill"=${JSON.stringify(
          overrides.fill
        )}`
      )
    }
    warnings.push(
      ...warnRemaining(
        overrides,
        new Set(['fill', 'strokeWidth']),
        'Checkbox',
        key
      )
    )
    return { props, warnings }
  }
  if (target.name === 'Check') {
    if (overrides.enabled === true) {
      return {
        props: { checked: true },
        warnings: warnRemaining(
          overrides,
          new Set(['enabled']),
          'Checkbox',
          key
        ),
      }
    }
    return {
      props: {},
      warnings: [
        `Checkbox: unmapped descendant override "${key}" (enabled=${String(
          overrides.enabled
        )})`,
      ],
    }
  }
  if (target.name === 'Label' && typeof overrides.content === 'string') {
    return {
      props: { label: overrides.content },
      warnings: warnRemaining(overrides, new Set(['content']), 'Checkbox', key),
    }
  }
  return undefined
}

/**
 * Stack (repro.pen master oj0de). Raw override -> semantic prop:
 *
 * | scope  | raw override        | prop                              |
 * | ------ | ------------------- | --------------------------------- |
 * | own    | gap                 | gap (SpacingToken \| number)      |
 * | Child 1 (Vx0bQ) | content  | children                          |
 * | Child 2 (E0ZK6) / Child 3 (D6MKAC) | enabled: false | absorbed (structural child-hiding) |
 *
 * Absorbed cosmetic keys: own `padding` (Stack has no padding prop — the
 * gallery instance pads the stack container); Child 1 node-shaping keys
 * (`type`, `id`, `name`, `fill`, `textGrowth`, `width`, `fontFamily`,
 * `fontSize`, `fontWeight`, `lineHeight`, `textAlign`) that describe the
 * replacement text node, not a Stack prop.
 */
const STACK_MAPPED_KEYS = new Set(['gap', 'padding'])

function resolveStackOwnOverrides(ref: PenNode): OverrideResolution {
  const own = ref as Record<string, unknown>
  const props: Record<string, unknown> = {}
  const warnings: string[] = []
  if ('gap' in own) props.gap = own.gap
  for (const warning of unmappedWarnings(own, STACK_MAPPED_KEYS, 'Stack')) {
    warnings.push(warning)
  }
  return { props, warnings }
}

function resolveStackDescendant(
  key: string,
  target: DescendantTarget,
  overrides: Record<string, unknown>
): OverrideResolution | undefined {
  if (target.name === 'Child 1' && typeof overrides.content === 'string') {
    return {
      props: { children: overrides.content },
      warnings: warnRemaining(
        overrides,
        new Set([
          'content',
          'type',
          'id',
          'name',
          'fill',
          'textGrowth',
          'width',
          'fontFamily',
          'fontSize',
          'fontWeight',
          'lineHeight',
          'textAlign',
        ]),
        'Stack',
        key
      ),
    }
  }
  if (target.name === 'Child 2' || target.name === 'Child 3') {
    if (overrides.enabled === false) {
      return {
        props: {},
        warnings: warnRemaining(overrides, new Set(['enabled']), 'Stack', key),
      }
    }
    return {
      props: {},
      warnings: [
        `Stack: unmapped descendant override "${key}" (enabled=${String(
          overrides.enabled
        )})`,
      ],
    }
  }
  return undefined
}

/**
 * TextField (repro.pen master Q6CWT). Raw override -> semantic prop:
 *
 * | descendant target | raw override        | prop            |
 * | ----------------- | ------------------- | --------------- |
 * | Label (WGsF1)     | content             | label           |
 * | Value (k7Szg)     | content             | value           |
 * | Error (v16Rdg)    | enabled: false      | absorbed (structural) |
 *
 * Absorbed cosmetic keys: Value `fill` (text color on the input value).
 */
function resolveTextFieldDescendant(
  key: string,
  target: DescendantTarget,
  overrides: Record<string, unknown>
): OverrideResolution | undefined {
  if (target.name === 'Label' && typeof overrides.content === 'string') {
    return {
      props: { label: overrides.content },
      warnings: warnRemaining(
        overrides,
        new Set(['content']),
        'TextField',
        key
      ),
    }
  }
  if (target.name === 'Value' && typeof overrides.content === 'string') {
    return {
      props: { value: overrides.content },
      warnings: warnRemaining(
        overrides,
        new Set(['content', 'fill']),
        'TextField',
        key
      ),
    }
  }
  if (target.name === 'Error') {
    if (overrides.enabled === false) {
      return {
        props: {},
        warnings: warnRemaining(
          overrides,
          new Set(['enabled']),
          'TextField',
          key
        ),
      }
    }
    return {
      props: {},
      warnings: [
        `TextField: unmapped descendant override "${key}" (enabled=${String(
          overrides.enabled
        )})`,
      ],
    }
  }
  return undefined
}

/**
 * Toggle (repro.pen master OMduR). Raw override -> semantic prop:
 *
 * | descendant target | raw override                       | prop          |
 * | ----------------- | ---------------------------------- | ------------- |
 * | Track (d6Q9W)     | fill:$color-primary + strokeWidth:0 | checked: true |
 * | Knob (VYbf2)      | x:16 (+ fill)                       | checked: true |
 * | Label (VZBQ5)     | content                             | label         |
 *
 * Absorbed cosmetic keys: Track `strokeWidth` (0 in the on-state encoding);
 * Knob `fill` ($color-text-inverse rides with the on-state position).
 */
function resolveToggleDescendant(
  key: string,
  target: DescendantTarget,
  overrides: Record<string, unknown>
): OverrideResolution | undefined {
  if (target.name === 'Track') {
    const props: Record<string, unknown> = {}
    const warnings: string[] = []
    if (overrides.fill === '$color-primary') {
      props.checked = true
    } else if (overrides.fill !== undefined) {
      warnings.push(
        `Toggle: unmapped descendant override "${key}" -> "fill"=${JSON.stringify(
          overrides.fill
        )}`
      )
    }
    warnings.push(
      ...warnRemaining(
        overrides,
        new Set(['fill', 'strokeWidth']),
        'Toggle',
        key
      )
    )
    return { props, warnings }
  }
  if (target.name === 'Knob') {
    const props: Record<string, unknown> = {}
    const warnings: string[] = []
    if (overrides.x === 16) {
      props.checked = true
    } else if (overrides.x !== undefined) {
      warnings.push(
        `Toggle: unmapped descendant override "${key}" -> "x"=${JSON.stringify(
          overrides.x
        )}`
      )
    }
    warnings.push(
      ...warnRemaining(overrides, new Set(['x', 'fill']), 'Toggle', key)
    )
    return { props, warnings }
  }
  if (target.name === 'Label' && typeof overrides.content === 'string') {
    return {
      props: { label: overrides.content },
      warnings: warnRemaining(overrides, new Set(['content']), 'Toggle', key),
    }
  }
  return undefined
}

/**
 * FullPageError (repro.pen master HkYOE). Raw override -> semantic prop:
 *
 * | descendant target | raw override | prop        |
 * | ----------------- | ------------ | ----------- |
 * | Title (enRw5)     | content      | title       |
 * | Description (VaehS) | content    | description |
 */
function resolveFullPageErrorDescendant(
  key: string,
  target: DescendantTarget,
  overrides: Record<string, unknown>
): OverrideResolution | undefined {
  if (target.name === 'Title' && typeof overrides.content === 'string') {
    return {
      props: { title: overrides.content },
      warnings: warnRemaining(
        overrides,
        new Set(['content']),
        'FullPageError',
        key
      ),
    }
  }
  if (target.name === 'Description' && typeof overrides.content === 'string') {
    return {
      props: { description: overrides.content },
      warnings: warnRemaining(
        overrides,
        new Set(['content']),
        'FullPageError',
        key
      ),
    }
  }
  return undefined
}

/**
 * Avatar (repro.pen master llVi8). Raw override -> semantic prop:
 *
 * | descendant target | raw override | prop |
 * | ----------------- | ------------ | ---- |
 * | Name (RWxhn)      | content      | name |
 */
function resolveAvatarDescendant(
  key: string,
  target: DescendantTarget,
  overrides: Record<string, unknown>
): OverrideResolution | undefined {
  if (target.name === 'Name' && typeof overrides.content === 'string') {
    return {
      props: { name: overrides.content },
      warnings: warnRemaining(overrides, new Set(['content']), 'Avatar', key),
    }
  }
  return undefined
}

/**
 * AvatarStackSummary (repro.pen master GAQhh). Raw override -> semantic prop:
 *
 * | descendant target | raw override | prop  |
 * | ----------------- | ------------ | ----- |
 * | Label (iHoIK)     | content      | label |
 *
 * Absorbed cosmetic keys: Label `fill` and `fontWeight` (overflow vs linked
 * copy variants style the label, which carries no semantic prop of its own).
 */
function resolveAvatarStackSummaryDescendant(
  key: string,
  target: DescendantTarget,
  overrides: Record<string, unknown>
): OverrideResolution | undefined {
  if (target.name === 'Label' && typeof overrides.content === 'string') {
    return {
      props: { label: overrides.content },
      warnings: warnRemaining(
        overrides,
        new Set(['content', 'fill', 'fontWeight']),
        'AvatarStackSummary',
        key
      ),
    }
  }
  return undefined
}

/**
 * Badge (repro.pen master d2CvF). Raw override -> semantic prop:
 *
 * | scope           | raw override | prop                   |
 * | --------------- | ------------ | ---------------------- |
 * | own             | fill token   | context (see below)    |
 * | Label (nNYA6)   | content      | children               |
 *
 * Badge context from own fill token (default 'neutral' is omitted):
 *   $color-bg-hover -> neutral, $color-info-subtle -> info,
 *   $color-success-subtle -> success, $color-warning-subtle -> warning,
 *   $color-danger-subtle -> danger.
 *
 * Absorbed cosmetic keys: own `stroke` (border color is derived from the
 * badge context, mirroring Badge.tsx borderColorMap); Label `fill` (text
 * color derived from context).
 */
const BADGE_CONTEXT_FROM_TOKEN: Record<string, string> = {
  '$color-bg-hover': 'neutral',
  '$color-info-subtle': 'info',
  '$color-success-subtle': 'success',
  '$color-warning-subtle': 'warning',
  '$color-danger-subtle': 'danger',
}

const BADGE_MAPPED_KEYS = new Set(['fill', 'stroke'])

function resolveBadgeOwnOverrides(ref: PenNode): OverrideResolution {
  const own = ref as Record<string, unknown>
  const props: Record<string, unknown> = {}
  const warnings: string[] = []
  const fill = typeof own.fill === 'string' ? own.fill : undefined
  if (fill) {
    const context = BADGE_CONTEXT_FROM_TOKEN[fill]
    if (context !== undefined) {
      if (context !== 'neutral') props.context = context
    } else {
      warnings.push(`Badge: unmapped override "fill"=${JSON.stringify(fill)}`)
    }
  }
  for (const warning of unmappedWarnings(own, BADGE_MAPPED_KEYS, 'Badge')) {
    warnings.push(warning)
  }
  return { props, warnings }
}

function resolveBadgeDescendant(
  key: string,
  target: DescendantTarget,
  overrides: Record<string, unknown>
): OverrideResolution | undefined {
  if (target.name === 'Label' && typeof overrides.content === 'string') {
    return {
      props: { children: overrides.content },
      warnings: warnRemaining(
        overrides,
        new Set(['content', 'fill']),
        'Badge',
        key
      ),
    }
  }
  return undefined
}

/**
 * Input (repro.pen master KnDBg). Raw override -> semantic prop:
 *
 * | scope               | raw override           | prop            |
 * | ------------------- | ---------------------- | --------------- |
 * | own                 | stroke:$color-danger   | context: 'error'|
 * | Placeholder (OZNpU) | content                | value           |
 *
 * Absorbed cosmetic keys: Placeholder `fill` (input text color; the gallery
 * distinguishes placeholder-muted vs value-default via the fill token).
 */
const INPUT_MAPPED_KEYS = new Set(['stroke'])

function resolveInputOwnOverrides(ref: PenNode): OverrideResolution {
  const own = ref as Record<string, unknown>
  const props: Record<string, unknown> = {}
  const warnings: string[] = []
  const stroke = typeof own.stroke === 'string' ? own.stroke : undefined
  if (stroke === '$color-danger') {
    props.context = 'error'
  } else if (stroke !== undefined) {
    warnings.push(`Input: unmapped override "stroke"=${JSON.stringify(stroke)}`)
  }
  for (const warning of unmappedWarnings(own, INPUT_MAPPED_KEYS, 'Input')) {
    warnings.push(warning)
  }
  return { props, warnings }
}

function resolveInputDescendant(
  key: string,
  target: DescendantTarget,
  overrides: Record<string, unknown>
): OverrideResolution | undefined {
  if (target.name === 'Placeholder' && typeof overrides.content === 'string') {
    return {
      props: { value: overrides.content },
      warnings: warnRemaining(
        overrides,
        new Set(['content', 'fill']),
        'Input',
        key
      ),
    }
  }
  return undefined
}

/** Alert v2: Icon/Message solid fills -> type (idempotent with tint->type). */
function resolveAlertDescendant(
  key: string,
  target: DescendantTarget,
  overrides: Record<string, unknown>
): OverrideResolution | undefined {
  if (target.name !== 'Icon' && target.name !== 'Message') return undefined
  const props: Record<string, unknown> = {}
  const warnings: string[] = []
  const fill = typeof overrides.fill === 'string' ? overrides.fill : undefined
  if (fill !== undefined) {
    const type = ALERT_TYPE_FROM_SOLID[fill]
    if (type !== undefined) {
      if (type !== 'info') props.type = type
    } else {
      warnings.push(
        `Alert: unmapped descendant override "${key}" -> "fill"=${JSON.stringify(
          fill
        )}`
      )
    }
  }
  const handled = new Set(['fill'])
  if (typeof overrides.content === 'string') {
    // String content only maps to children on the Message target. On Icon it
    // is unmapped and must warn (warn-never-drop), never be silently absorbed.
    if (target.name === 'Message') {
      props.children = overrides.content
      handled.add('content')
    }
  }
  warnings.push(...warnRemaining(overrides, handled, 'Alert', key))
  return { props, warnings }
}

interface MasterVocabulary {
  /** Resolve the ref node's own overrides into presentational props. */
  resolveOwn(ref: PenNode): OverrideResolution
  /**
   * Resolve a descendant text-content override into presentational props
   * (e.g. Button Label -> children). Returns undefined when unmapped.
   */
  resolveTextContent(
    targetName: string,
    content: string
  ): Record<string, unknown> | undefined
  /**
   * REP-1629: full descendant override resolution (text or non-text
   * targets). Consulted before the v1 text-content / enabled=false / generic
   * warn fall-through; returning a resolution always suppresses those paths
   * (AC3 — no in-vocabulary override ever warns). Returns undefined when the
   * override is out of vocabulary so v1 behavior is preserved byte-for-byte.
   */
  resolveDescendant?(
    key: string,
    target: DescendantTarget,
    overrides: Record<string, unknown>
  ): OverrideResolution | undefined
}

const VOCABULARIES: Record<string, MasterVocabulary> = {
  Button: {
    resolveOwn: resolveButtonOwnOverrides,
    resolveTextContent(targetName, content) {
      if (targetName === 'Label') return { children: content }
      return undefined
    },
  },
  Alert: {
    resolveOwn: resolveAlertOwnOverrides,
    resolveTextContent(targetName, content) {
      if (targetName === 'Message') return { children: content }
      return undefined
    },
    resolveDescendant: resolveAlertDescendant,
  },
  Checkbox: {
    resolveOwn: NO_OWN_OVERRIDES,
    resolveTextContent: () => undefined,
    resolveDescendant: resolveCheckboxDescendant,
  },
  Stack: {
    resolveOwn: resolveStackOwnOverrides,
    resolveTextContent: () => undefined,
    resolveDescendant: resolveStackDescendant,
  },
  TextField: {
    resolveOwn: NO_OWN_OVERRIDES,
    resolveTextContent: () => undefined,
    resolveDescendant: resolveTextFieldDescendant,
  },
  Toggle: {
    resolveOwn: NO_OWN_OVERRIDES,
    resolveTextContent: () => undefined,
    resolveDescendant: resolveToggleDescendant,
  },
  FullPageError: {
    resolveOwn: NO_OWN_OVERRIDES,
    resolveTextContent: () => undefined,
    resolveDescendant: resolveFullPageErrorDescendant,
  },
  Avatar: {
    resolveOwn: NO_OWN_OVERRIDES,
    resolveTextContent: () => undefined,
    resolveDescendant: resolveAvatarDescendant,
  },
  AvatarStackSummary: {
    resolveOwn: NO_OWN_OVERRIDES,
    resolveTextContent: () => undefined,
    resolveDescendant: resolveAvatarStackSummaryDescendant,
  },
  Badge: {
    resolveOwn: resolveBadgeOwnOverrides,
    resolveTextContent: () => undefined,
    resolveDescendant: resolveBadgeDescendant,
  },
  Input: {
    resolveOwn: resolveInputOwnOverrides,
    resolveTextContent: () => undefined,
    resolveDescendant: resolveInputDescendant,
  },
}

// ---------------------------------------------------------------------------
// Descendant override resolution (id-carrying)
// ---------------------------------------------------------------------------

interface DescendantTarget {
  id: string
  type: string
  name: string
}

/**
 * Depth-first search of a single master's own subtree (does NOT follow ref
 * indirection — nested ref paths are resolved explicitly by the caller).
 * This is a master-scoped lookup, distinct from the repo-wide
 * findNodeByIdRecursive in pen-lint.
 */
function findNodeInMasterSubtree(root: PenNode, id: string): PenNode | null {
  if (!Array.isArray(root.children)) return null
  const stack = [...root.children]
  while (stack.length > 0) {
    const node = stack.pop()!
    if (node.id === id) return node
    if (Array.isArray(node.children)) stack.push(...node.children)
  }
  return null
}

interface DescendantResolveResult {
  target: DescendantTarget | null
  /** Set when the key was structurally unsupported in v1 (vs. not found). */
  unsupported?: string
}

/**
 * Resolve a descendant override key to the node it names inside a master.
 * Keys are either a plain node id ("SKrlh") or a nested ref path
 * ("w9QiD/CogW2" — ref id in the master + node id inside that ref's master).
 */
function resolveDescendantTarget(
  masterNode: PenNode,
  key: string,
  masterNodeById: Map<string, PenNode>
): DescendantResolveResult {
  if (key.includes('/')) {
    const slash = key.indexOf('/')
    const refId = key.slice(0, slash)
    const childId = key.slice(slash + 1)
    if (childId.includes('/')) {
      return {
        target: null,
        unsupported:
          'descendant path deeper than 2 segments not supported in v1; override skipped',
      }
    }
    const ref = findNodeInMasterSubtree(masterNode, refId)
    if (!ref) return { target: null }
    if (ref.type !== 'ref') {
      return {
        target: null,
        unsupported: `descendant path "${key}" left segment "${refId}" is not a ref; override skipped`,
      }
    }
    const refMaster = masterNodeById.get(String(ref.ref))
    if (!refMaster) return { target: null }
    const target = findNodeInMasterSubtree(refMaster, childId)
    if (!target) return { target: null }
    return {
      target: {
        id: String(target.id),
        type: String(target.type),
        name: String(target.name),
      },
    }
  }
  const target = findNodeInMasterSubtree(masterNode, key)
  if (!target) return { target: null }
  return {
    target: {
      id: String(target.id),
      type: String(target.type),
      name: String(target.name),
    },
  }
}

// ---------------------------------------------------------------------------
// Contract tree builder
// ---------------------------------------------------------------------------

interface BuildContext {
  masterNodeById: Map<string, PenNode>
  masterGroupPathById: Map<string, string>
  exportsByPackage: Map<string, Set<string>>
  violations: ContractViolation[]
  warnings: string[]
  screenId: string
  screenName: string
}

/** Sort an object's keys alphabetically for deterministic output. */
function sortedObject(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
  )
}

/** Render a node-replacement override (children array / non-text subtree). */
function walkTree(node: PenNode, ctx: BuildContext): ContractTreeNode {
  switch (node.type) {
    case 'ref':
      return walkRef(node, ctx)
    case 'text':
      return {
        type: 'text',
        id: node.id,
        name: node.name,
        content: typeof node.content === 'string' ? node.content : undefined,
      }
    default: {
      // A bare children-array replacement that omits `type` is a frame-like
      // container (the tree walker treats it the same way).
      const treeNode: ContractTreeNode = {
        type: node.type || 'frame',
        id: node.id,
        name: node.name,
      }
      if (Array.isArray(node.children)) {
        treeNode.children = node.children.map(child => walkTree(child, ctx))
      }
      return treeNode
    }
  }
}

function walkRef(node: PenNode, ctx: BuildContext): ContractTreeNode {
  const masterNode = ctx.masterNodeById.get(String(node.ref))
  if (!masterNode) {
    const violation: ContractViolation = {
      screenId: ctx.screenId,
      screenName: ctx.screenName,
      refId: node.id,
      masterName: String(node.name),
      reason: `ref references unknown master "${String(node.ref)}"`,
      candidates: [],
    }
    ctx.violations.push(violation)
    return {
      type: 'ref',
      id: node.id,
      name: node.name,
      violations: [violation],
    }
  }

  const masterName = String(masterNode.name)
  const masterGroupPath = ctx.masterGroupPathById.get(masterNode.id) ?? ''
  const resolution = resolveMasterFromPath(
    masterGroupPath,
    masterName,
    ctx.exportsByPackage
  )
  if (!resolution.ok) {
    const violation: ContractViolation = {
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
    }
    ctx.violations.push(violation)
    return {
      type: 'ref',
      id: node.id,
      name: node.name,
      masterId: String(node.ref),
      violations: [violation],
    }
  }

  const vocabulary = VOCABULARIES[resolution.comp]
  const treeNode: ContractTreeNode = {
    type: 'ref',
    id: node.id,
    name: node.name,
    masterId: String(node.ref),
    component: {
      package: resolution.pkg,
      export: resolution.comp,
      import: `@repro/${resolution.pkg}`,
    },
  }
  const props: Record<string, unknown> = {}
  const treeChildren: ContractTreeNode[] = []

  if (vocabulary) {
    const own = vocabulary.resolveOwn(node)
    Object.assign(props, own.props)
    for (const warning of own.warnings) ctx.warnings.push(warning)
  }

  const descendants =
    node.descendants && typeof node.descendants === 'object'
      ? (node.descendants as Record<string, unknown>)
      : {}
  for (const [key, override] of Object.entries(descendants).sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    if (!override || typeof override !== 'object') continue
    const overrides = override as Record<string, unknown>

    // Node replacement — carried in the tree so the effective composition
    // survives; the key is still reported as unmapped in v1. Only an override
    // carrying structural content (children) counts; a scalar type override
    // ({ type: 'frame', fill }) is styling and must flow through target
    // resolution below instead of splicing an empty node that discards it.
    const isNodeReplacement = Array.isArray(overrides.children)
    if (isNodeReplacement) {
      treeChildren.push(walkTree(overrides as PenNode, ctx))
      ctx.warnings.push(
        `${resolution.comp}: unmapped descendant override "${key}" (node replacement)`
      )
      continue
    }

    const resolved = resolveDescendantTarget(
      masterNode,
      key,
      ctx.masterNodeById
    )
    const target = resolved.target
    // REP-1629: full descendant resolution (text or non-text targets) takes
    // precedence over the v1 text-content / enabled=false / generic warn
    // fall-through below. A resolution always maps props and pushes its own
    // warnings (AC3: in-vocabulary overrides never warn).
    if (target && vocabulary?.resolveDescendant) {
      const mapped = vocabulary.resolveDescendant(key, target, overrides)
      if (mapped) {
        Object.assign(props, mapped.props)
        for (const warning of mapped.warnings) ctx.warnings.push(warning)
        continue
      }
    }
    if (
      target &&
      target.type === 'text' &&
      typeof overrides.content === 'string'
    ) {
      if (vocabulary) {
        const mapped = vocabulary.resolveTextContent(
          target.name,
          overrides.content
        )
        if (mapped) {
          Object.assign(props, mapped)
          // Remaining scalar keys on the text override (e.g. Label fill) are
          // cosmetic text styling — unmapped in v1.
          for (const k of Object.keys(overrides)) {
            if (k === 'content' || k === 'id') continue
            ctx.warnings.push(
              `${resolution.comp}: unmapped descendant override "${key}" -> "${k}"`
            )
          }
          continue
        }
      }
      // Unmapped text override: keep the copy in the tree so nothing is lost.
      ctx.warnings.push(
        `${resolution.comp}: unmapped descendant override "${key}"`
      )
      treeChildren.push({
        type: 'text',
        id: target.id,
        name: target.name,
        content: overrides.content,
      })
      continue
    }

    if (!target) {
      ctx.warnings.push(
        resolved.unsupported
          ? `${resolution.comp}: ${resolved.unsupported}`
          : `${resolution.comp}: unmapped descendant override "${key}" (no matching node in master)`
      )
      continue
    }
    if (overrides.enabled === false) {
      ctx.warnings.push(
        `${resolution.comp}: unmapped descendant override "${key}" (enabled=false)`
      )
      continue
    }
    // Remaining scalar overrides (fill/stroke/icon/x/y/...) are cosmetic
    // details of the master's internal rendering — unmapped in v1.
    ctx.warnings.push(
      `${resolution.comp}: unmapped descendant override "${key}"`
    )
  }

  if (Object.keys(props).length > 0) {
    treeNode.presentationalOverrides = sortedObject(props)
  }
  if (treeChildren.length > 0) {
    treeNode.children = treeChildren
  }
  return treeNode
}

// ---------------------------------------------------------------------------
// HTML scaffold (derived from the contract, deterministic)
// ---------------------------------------------------------------------------

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function renderValueHtml(value: unknown): string {
  if (typeof value === 'string') return escapeHtml(value)
  // JSON.stringify(undefined) is undefined, which escapeHtml would choke on;
  // null/undefined override values render as empty.
  if (value === undefined || value === null) return ''
  return escapeHtml(JSON.stringify(value))
}

function renderTreeHtml(node: ContractTreeNode, depth: number): string {
  const pad = '  '.repeat(depth)
  if (node.type === 'text') {
    return `${pad}<span class="text">${renderValueHtml(
      node.content ?? ''
    )}</span>`
  }
  const lines: string[] = []
  if (node.type === 'ref') {
    const attrs: string[] = []
    if (node.component) {
      attrs.push(
        `data-component="${escapeHtml(
          `${node.component.package}::${node.component.export}`
        )}"`
      )
    }
    if (node.masterId)
      attrs.push(`data-master-id="${escapeHtml(node.masterId)}"`)
    const attrText = attrs.length > 0 ? ` ${attrs.join(' ')}` : ''
    lines.push(`${pad}<div class="ref"${attrText}>`)
    if (node.component) {
      lines.push(
        `${pad}  <span class="component-name">${escapeHtml(
          node.component.export
        )}</span>`
      )
    }
    for (const [key, value] of Object.entries(
      node.presentationalOverrides ?? {}
    ).sort()) {
      lines.push(
        `${pad}  <span class="prop prop-${escapeHtml(key)}">${escapeHtml(
          key
        )}=${renderValueHtml(value)}</span>`
      )
    }
    for (const violation of node.violations ?? []) {
      lines.push(
        `${pad}  <span class="violation">${escapeHtml(violation.reason)}</span>`
      )
    }
    for (const child of node.children ?? []) {
      lines.push(renderTreeHtml(child, depth + 1))
    }
    lines.push(`${pad}</div>`)
    return lines.join('\n')
  }
  // frame / group / other containers
  lines.push(`${pad}<div class="${escapeHtml(node.type)}">`)
  if (node.name && node.type !== 'frame') {
    lines.push(
      `${pad}  <span class="node-name">${escapeHtml(node.name)}</span>`
    )
  }
  for (const child of node.children ?? []) {
    lines.push(renderTreeHtml(child, depth + 1))
  }
  lines.push(`${pad}</div>`)
  return lines.join('\n')
}

function renderScreenHtml(screen: ContractScreen): string {
  const stateAttrs: string[] = []
  if (screen.stateFamily) {
    stateAttrs.push(`data-state-family="${escapeHtml(screen.stateFamily)}"`)
  }
  if (screen.state) {
    stateAttrs.push(`data-state="${escapeHtml(screen.state)}"`)
  }
  const stateText = stateAttrs.length > 0 ? ` ${stateAttrs.join(' ')}` : ''
  return [
    `  <section class="screen" data-screen-id="${escapeHtml(
      screen.screenId
    )}"${stateText}>`,
    `    <h1>${escapeHtml(screen.screenName)}</h1>`,
    renderTreeHtml(screen.tree, 2),
    '  </section>',
  ].join('\n')
}

export function renderContractHtml(contract: PenContract): string {
  const body = contract.screens
    .map(screen => renderScreenHtml(screen))
    .join('\n')
  return [
    '<!doctype html>',
    '<html>',
    '<head>',
    '  <meta charset="utf-8" />',
    '  <title>Repro design-intent contract</title>',
    '</head>',
    '<body>',
    body,
    '</body>',
    '</html>',
    '',
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Contract generation
// ---------------------------------------------------------------------------

function sortViolations(violations: ContractViolation[]): ContractViolation[] {
  return [...violations].sort((a, b) => {
    return (
      (a.screenId ?? '').localeCompare(b.screenId ?? '') ||
      (a.refId ?? '').localeCompare(b.refId ?? '') ||
      a.reason.localeCompare(b.reason)
    )
  })
}

export interface ContractOptions {
  penFile?: string
  screen?: string
  html?: boolean
  dryRun?: boolean
  log?: (msg: string) => void
  jsonOut?: (json: string) => void
  /** Injectable package export map; defaults to a full repo scan. */
  exportsByPackage?: Map<string, Set<string>>
}

export interface ContractResult {
  code: number
  contract: PenContract
  html?: string
}

export function runContract(options: ContractOptions = {}): ContractResult {
  const penFile = options.penFile ?? PEN_FILE
  const log = options.log ?? ((msg: string) => console.error(msg))
  const jsonOut = options.jsonOut ?? ((json: string) => console.log(json))

  let pen: PenFile
  try {
    pen = parsePenJson(readFileSync(penFile, 'utf8'))
  } catch (err) {
    log(`ERROR: failed to read or parse ${penFile}: ${String(err)}`)
    return {
      code: 1,
      contract: {
        mode: 'contract',
        penVersion: '',
        clean: false,
        screenCount: 0,
        screens: [],
        stateFamilies: [],
        violations: [],
        warnings: [],
      },
    }
  }

  const exportsByPackage =
    options.exportsByPackage ?? collectAllPackageExports()
  const masters = extractMasters(pen)
  const masterNodeById = new Map<string, PenNode>()
  const masterGroupPathById = new Map<string, string>()
  for (const master of masters) {
    const node = findNodeByIdRecursive(pen, master.id)
    if (node) {
      masterNodeById.set(master.id, node)
      masterGroupPathById.set(master.id, master.groupPath)
    }
  }

  let screens = extractScreens(pen)
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
      return {
        code: 1,
        contract: {
          mode: 'contract',
          penVersion: String(pen.version),
          clean: false,
          screenCount: screens.length,
          screens: [],
          stateFamilies: [],
          violations: [],
          warnings: [],
        },
      }
    }
    screens = [match]
  }
  screens = [...screens].sort((a, b) => a.id.localeCompare(b.id))

  const ctx: BuildContext = {
    masterNodeById,
    masterGroupPathById,
    exportsByPackage,
    violations: [],
    warnings: [],
    screenId: '',
    screenName: '',
  }

  const contractScreens: ContractScreen[] = []
  for (const screen of screens) {
    ctx.screenId = screen.id
    ctx.screenName = screen.name
    const frame = findNodeByIdRecursive(pen, screen.id)
    const tree = frame
      ? walkTree(frame, ctx)
      : { type: 'frame', id: screen.id, name: screen.name }
    contractScreens.push({
      screenId: screen.id,
      screenName: screen.name,
      groupPath: screen.groupPath,
      stateFamily: screen.stateFamily,
      state: screen.state,
      tree,
    })
  }

  // Per-screen state metadata (state in enum, both-or-neither) is a property
  // of each screen itself and is always validated, even for --screen runs.
  for (const sv of validateScreenStateMetadata(screens)) {
    ctx.violations.push({ ...sv, candidates: [] })
  }
  // Family-aggregate validation spans a family's whole screen set. With
  // --screen the filtered set would produce false "no content screen"
  // violations, so the aggregates are skipped for scoped runs; the full
  // contract keeps strict validation.
  if (!options.screen) {
    for (const sv of validateFamilyStateAggregates(screens)) {
      ctx.violations.push({ ...sv, candidates: [] })
    }
  }

  const stateFamilies: ContractStateFamily[] = [
    ...extractStateFamilies(screens).entries(),
  ]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([family, states]) => ({
      family,
      states: sortedObject(
        states as Record<string, unknown>
      ) as ContractStateFamily['states'],
    }))

  const contract: PenContract = {
    mode: 'contract',
    penVersion: String(pen.version),
    clean: ctx.violations.length === 0,
    screenCount: contractScreens.length,
    screens: contractScreens,
    stateFamilies,
    violations: sortViolations(ctx.violations),
    // Warnings are informational (unmapped overrides, unsupported descendant
    // paths) and never affect `clean` — only violations do.
    warnings: [...new Set(ctx.warnings)].sort(),
  }

  if (options.html) {
    const html = renderContractHtml(contract)
    jsonOut(html)
    return { code: contract.clean ? 0 : 1, contract, html }
  }
  jsonOut(JSON.stringify(contract, null, 2))
  return { code: contract.clean ? 0 : 1, contract }
}

// ---------------------------------------------------------------------------
// CLI interface
// ---------------------------------------------------------------------------

export interface CliParseResult {
  options: ContractOptions
  error?: string
}

const FLAG_VALUE_DESCRIPTIONS: Record<string, string> = {
  '--screen': 'screen name, normalized name, or id',
  '--pen-file': 'path to a .pen file',
}

/**
 * Parse CLI args into ContractOptions; returns an error for malformed usage.
 * Args are scanned left-to-right so a flag always consumes the immediately
 * following token as its value; a flag name used as a value or a missing
 * value is rejected.
 */
export function parseCliArgs(args: string[]): CliParseResult {
  const options: ContractOptions = {}
  const assigners: Record<string, (value: string) => void> = {
    '--screen': value => {
      options.screen = value
    },
    '--pen-file': value => {
      options.penFile = value
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
    if (arg === '--html') {
      options.html = true
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

function printUsage(): void {
  console.error(`pen-contract — deterministic pen design-intent contract (REP-1622)

Reads repro.pen and emits a design-intent contract to stdout. The contract
resolves every master instance to a concrete @repro/<pkg> export (path-based
identity), extracts presentational props from the closed override vocabulary,
groups screens into state families, and reports unresolved instances with
"did you mean?" candidates. Never writes files.

Usage:
  tsx scripts/pen-contract.ts                  Emit the contract for every
                                               screen in repro.pen to stdout.
                                               Exit non-zero on violations.
  tsx scripts/pen-contract.ts --screen <name>  Emit the contract for one screen
                                               (normalized name, raw name, id).
  tsx scripts/pen-contract.ts --pen-file <p>   Use <p> instead of repro.pen.
  tsx scripts/pen-contract.ts --html           Emit a self-contained HTML
                                               scaffold derived from the
                                               contract (resolved masters,
                                               props, state) instead of JSON.
  tsx scripts/pen-contract.ts --dry-run        Validate only; output is
                                               identical to a normal run (the
                                               tool never writes files).
  tsx scripts/pen-contract.ts --help           Show this help.

Exit codes:
  0  clean (no violations)
  1  violations or usage error

JSON contract (v1):
  { "mode": "contract", "penVersion", "clean", "screenCount",
    "screens": [ { "screenId", "screenName", "groupPath", "stateFamily"?,
      "state"?, "tree" } ],
    "stateFamilies": [ { "family", "states": { state -> screen } } ],
    "violations": [ { "screenId", "screenName", "refId"?, "masterName"?,
      "reason", "candidates" } ],
    "warnings": [ ... ] }`)
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
  // Drain async stdout before exiting: process.exit() would cut off pending
  // writes when stdout is a pipe, truncating the ~155KB contract at 64KB.
  process.exitCode = runContract(options).code
}
