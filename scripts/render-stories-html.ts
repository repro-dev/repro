#!/usr/bin/env node
// REP-1650: render workspace CSF stories to static HTML for the impeccable
// detector's DOM/geometry rules.
//
// Why this exists: the detector's static-html engine
// (.opencode/skills/impeccable/scripts/detector/engines/static-html) carries
// the DOM/geometry rules (nested cards, clipped overflow, contrast, cramped
// padding, text overflow) and they only execute on .html files. Storybook 10
// static builds are SPA shells (component DOM renders client-side), so the
// stories are rendered server-side here instead:
//
//   - story files: packages/**/src/**/*.stories.tsx + apps/*/src/**/*.stories.tsx
//   - each named CSF story export renders via story.render(story.args) or the
//     default export's component
//   - jsxstyle SSR CSS is captured per story via `cacheSingleton.run`
//   - one full HTML doc per story lands in tmp/storybook-html/, plus a
//     manifest with rendered/failed counts
//
// Module-level preview decorators are deliberately NOT applied —
// apps/storybook-ui/.storybook/preview.js touches `document` at module scope
// and cannot be imported here. Story-level `decorators` arrays are applied.
//
// Exit codes: 1 when nothing rendered (harness broken), when failures
// outnumber rendered stories (majority-failure means the harness is broken,
// not the stories), or when any failure is "unexpected" — i.e. neither fixed
// nor covered by a reasoned entry in .impeccable/render-exclusions.json.
// Registry-covered failures keep exit 0 but stay visible in the manifest.
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { cacheSingleton } from '@jsxstyle/core'
import { createElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { htmlDocument } from './story-html-document.ts'
import {
  applyStoryDecorators,
  isPlainObject,
  mergeStoryArgs,
} from './story-render-utils.ts'
import { buildWaiverDirective } from './story-waiver-directive.ts'

export { applyStoryDecorators, mergeStoryArgs }

const __dirname = dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = resolve(__dirname, '..')
export const OUTPUT_DIR = resolve(REPO_ROOT, 'tmp/storybook-html')
export const MANIFEST_PATH = resolve(OUTPUT_DIR, 'manifest.json')
const DOMAIN_GENERATED_DIR = resolve(REPO_ROOT, 'packages/domain/generated')
const WIRE_FORMATS_GENERATED_DIR = resolve(
  REPO_ROOT,
  'packages/wire-formats/generated'
)
const TDL_GRAMMAR_BUNDLE = resolve(
  REPO_ROOT,
  'packages/tdl/src/cli/grammar.ohm-bundle.js'
)
const EXCLUSIONS_PATH = resolve(REPO_ROOT, '.impeccable/render-exclusions.json')

const EXCLUDED_DIRS = new Set(['node_modules', 'dist', 'storybook-static'])
const STORY_FILE_PATTERN = /\.stories\.tsx$/

/** Error text trimmed to keep the manifest readable. */
function trimError(err: unknown): string {
  const text = String(err instanceof Error ? err.message : err)
  return text.length > 500 ? `${text.slice(0, 500)}…` : text
}

/**
 * Gitignored codegen artifacts the render run depends on. `tdlc` (the codegen
 * CLI for both @repro/domain and @repro/wire-formats) imports @repro/tdl's
 * generated grammar bundle, and story files across the workspace transitively
 * import `../generated/*` modules from both generated packages — a fresh
 * worktree has none of these, so every dependent story file fails its module
 * import before any story can render. Build in dependency order; each step is
 * idempotent (skipped when its artifact exists).
 */
const CODEGEN_PREREQS = [
  {
    marker: TDL_GRAMMAR_BUNDLE,
    pkg: '@repro/tdl',
    why: 'tdlc (the codegen CLI for @repro/domain and @repro/wire-formats) imports the generated grammar bundle',
  },
  {
    marker: WIRE_FORMATS_GENERATED_DIR,
    pkg: '@repro/wire-formats',
    why: 'story files (devtools, playback, apps/capture) import ../generated/buffer-list from @repro/wire-formats',
  },
  {
    marker: DOMAIN_GENERATED_DIR,
    pkg: '@repro/domain',
    why: 'story files import ../generated/* modules from @repro/domain',
  },
] as const

function ensureCodegenPrerequisites(log: (msg: string) => void): void {
  for (const prereq of CODEGEN_PREREQS) {
    if (existsSync(prereq.marker)) continue
    log(
      `[render-stories-html] ${relativeFile(
        prereq.marker
      )} is missing — building ${prereq.pkg} codegen (\`pnpm --filter ${
        prereq.pkg
      } build\`)... (${prereq.why})`
    )
    try {
      execFileSync('pnpm', ['--filter', prereq.pkg, 'build'], {
        cwd: REPO_ROOT,
        stdio: 'inherit',
      })
    } catch (err) {
      throw new Error(
        `Failed to build ${prereq.pkg} codegen (\`pnpm --filter ${prereq.pkg} build\`). ${prereq.why}; without it dependent story files cannot resolve their imports. Fix the build error above and re-run.`,
        { cause: err }
      )
    }
    log(`[render-stories-html] ${prereq.pkg} codegen built.`)
  }
}

/**
 * Browser DOM constructor globals referenced by packages/recording's
 * html2VTree path (used by devtools/playback stories to build fixture data at
 * module scope): `new DOMParser()`, `Node.*` node-type constants, and
 * `instanceof` checks against ShadowRoot / HTMLSlotElement / friends in the
 * walker + factory. Static SSR runs in plain Node, so provide jsdom's
 * implementations — constructor references only: no window/document globals,
 * which would flip `typeof document` SSR branch checks across every
 * component.
 */
const DOM_CONSTRUCTOR_GLOBALS = [
  'DOMParser',
  'Node',
  'Element',
  'HTMLElement',
  'ShadowRoot',
  'Document',
  'DocumentFragment',
  'DocumentType',
  'Text',
  'Comment',
  'Attr',
  'HTMLSlotElement',
  'CSSStyleSheet',
] as const

async function ensureDomGlobals(log: (msg: string) => void): Promise<void> {
  const globalScope = globalThis as Record<string, unknown>
  const needs = DOM_CONSTRUCTOR_GLOBALS.filter(
    name => typeof globalScope[name] === 'undefined'
  )
  if (needs.length === 0) return
  try {
    const nodeRequire = createRequire(import.meta.url)
    const { JSDOM } = nodeRequire('jsdom') as {
      JSDOM: new () => { window: Record<string, unknown> }
    }
    const jsdomWindow = new JSDOM().window
    for (const name of needs) {
      const value = jsdomWindow[name]
      if (typeof value !== 'undefined') globalScope[name] = value
    }
    log(
      `[render-stories-html] provided jsdom globals (${needs.join(
        ', '
      )}) for module-scope story fixtures; window/document stay undefined.`
    )
  } catch {
    log(
      '[render-stories-html] WARNING: jsdom is not resolvable from the harness — story files building fixture data with browser DOM globals at module scope will fail their module import.'
    )
  }
}

export interface RenderExclusion {
  file: string
  story: string
  reason: string
}

/**
 * Explicit render-failure exclusions: [{file, story, reason}] where file is
 * repo-relative and story is the exact story key ("(module import)" for
 * module-level failures). Consumed here to classify manifest failures and by
 * the REP-1657 guard test to enforce that every failure carries a reason.
 */
export function loadRenderExclusions(
  log: (msg: string) => void
): RenderExclusion[] {
  if (!existsSync(EXCLUSIONS_PATH)) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(EXCLUSIONS_PATH, 'utf8'))
  } catch (err) {
    log(
      `[render-stories-html] WARNING: could not parse ${relativeFile(
        EXCLUSIONS_PATH
      )} — treating every failure as unexpected. ${trimError(err)}`
    )
    return []
  }
  if (!Array.isArray(parsed)) {
    log(
      `[render-stories-html] WARNING: ${relativeFile(
        EXCLUSIONS_PATH
      )} must be an array — treating every failure as unexpected.`
    )
    return []
  }
  return parsed.filter(
    (entry): entry is RenderExclusion =>
      typeof (entry as RenderExclusion).file === 'string' &&
      typeof (entry as RenderExclusion).story === 'string' &&
      typeof (entry as RenderExclusion).reason === 'string'
  )
}

function relativeFile(file: string): string {
  return relative(REPO_ROOT, file)
}

/** Sanitized module id used as the HTML filename prefix (collision-free). */
export function moduleFileId(file: string): string {
  const rel = relativeFile(file).replace(STORY_FILE_PATTERN, '')
  return rel.replaceAll(/[^a-zA-Z0-9]+/g, '-')
}

/** Deterministic story-file list: packages/ then apps/, depth-first sorted. */
export function collectStoryFiles(rootDir: string): string[] {
  const result: string[] = []
  const visit = (dir: string): void => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return // missing tree (e.g. no apps/ dir in a stripped checkout)
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (EXCLUDED_DIRS.has(entry.name)) continue
        visit(join(dir, entry.name))
      } else if (entry.isFile() && STORY_FILE_PATTERN.test(entry.name)) {
        result.push(join(dir, entry.name))
      }
    }
  }
  visit(rootDir)
  return result.sort()
}

/**
 * CSF story objects are plain objects carrying at least one story key. Plain
 * helper exports (functions, arrays, strings) are not stories and are skipped.
 */
export function isStoryObject(
  value: unknown
): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const storyKeys = [
    'render',
    'args',
    'decorators',
    'parameters',
    'play',
    'loaders',
    'tags',
    'name',
    'storyName',
  ] as const
  return storyKeys.some(key => key in (value as Record<string, unknown>))
}

type StoryComponent = (
  props: Record<string, unknown>
) => ReactNode | ReactElement

/**
 * CSF default exports are the Meta object (`{ component }`) or, in plain
 * CSF2, the component itself. Resolve a renderable component from either.
 * Components may be plain functions OR React element factories that are
 * objects (forwardRef / memo carry `$$typeof`) — `typeof === 'function'`
 * alone wrongly rejects most of @repro/design.
 */
export function resolveStoryComponent(
  defaultExport: unknown
): StoryComponent | null {
  const pickComponent = (candidate: unknown): StoryComponent | null => {
    if (typeof candidate === 'function') return candidate as StoryComponent
    if (
      candidate &&
      typeof candidate === 'object' &&
      '$$typeof' in (candidate as Record<string, unknown>)
    ) {
      return candidate as StoryComponent
    }
    return null
  }
  if (
    typeof defaultExport === 'function' ||
    (defaultExport && typeof defaultExport === 'object')
  ) {
    const direct = pickComponent(defaultExport)
    if (direct) return direct
    if (defaultExport && typeof defaultExport === 'object') {
      return pickComponent((defaultExport as Record<string, unknown>).component)
    }
  }
  return null
}

interface StoryFailure {
  file: string
  story: string
  error: string
}

interface FileRow {
  file: string
  rendered: number
  failed: number
}

// `htmlDocument` (with the REP-1658 body base font-size rule) lives in
// scripts/story-html-document.ts — dependency-free so the gate test can import
// it under plain `node --test`.

export async function runRender(
  options: { log?: (msg: string) => void } = {}
): Promise<{
  rendered: number
  failed: number
  excluded: number
  unexpected: number
}> {
  const log = options.log ?? ((msg: string) => console.error(msg))
  ensureCodegenPrerequisites(log)
  await ensureDomGlobals(log)
  const files = [
    ...collectStoryFiles(resolve(REPO_ROOT, 'packages')),
    ...collectStoryFiles(resolve(REPO_ROOT, 'apps')),
  ]
  mkdirSync(OUTPUT_DIR, { recursive: true })
  // Stale docs from earlier runs must never leak into the detector scan.
  for (const entry of readdirSync(OUTPUT_DIR)) {
    if (entry.endsWith('.html')) rmSync(join(OUTPUT_DIR, entry))
  }

  const failures: StoryFailure[] = []
  const rows: FileRow[] = []
  let rendered = 0

  for (const file of files) {
    const rel = relativeFile(file)
    let moduleExports: Record<string, unknown>
    try {
      moduleExports = (await import(pathToFileURL(file).href)) as Record<
        string,
        unknown
      >
    } catch (err) {
      failures.push({
        file: rel,
        story: '(module import)',
        error: trimError(err),
      })
      rows.push({ file: rel, rendered: 0, failed: 1 })
      continue
    }

    const component = resolveStoryComponent(moduleExports.default)
    const moduleId = moduleFileId(file)
    const metaArgs = isPlainObject(moduleExports.default)
      ? (moduleExports.default as Record<string, unknown>).args
      : undefined
    let fileRendered = 0
    let fileFailed = 0

    for (const [storyName, storyExport] of Object.entries(moduleExports)) {
      if (storyName === 'default') continue
      if (!isStoryObject(storyExport)) continue
      try {
        const story = storyExport
        // Storybook semantics: meta-level default.args are story defaults —
        // merged UNDER each story's args (story wins). Story-only resolution
        // crashed AvatarStackSummary Default on `items.slice` (items live in
        // meta args).
        const args = mergeStoryArgs(metaArgs, story.args)
        const element =
          typeof story.render === 'function'
            ? // Storybook invokes story.render inside a component render
              // pass; hook-using render functions crash with a null
              // dispatcher when called directly, so route it through a
              // wrapper component the same way Storybook does.
              createElement(function StoryRender(): ReactNode {
                return (
                  story.render as (
                    args: Record<string, unknown>,
                    story: Record<string, unknown>
                  ) => ReactElement
                )(args, story)
              })
            : component
            ? createElement(component, args)
            : null
        if (!element || typeof element !== 'object') {
          throw new Error(
            'no render function and no default component to render'
          )
        }
        const decorated =
          Array.isArray(story.decorators) && story.decorators.length > 0
            ? applyStoryDecorators(element, story.decorators, {
                ...story,
                args,
              })
            : element
        const { returnValue: markup, css } = await cacheSingleton.run(() =>
          renderToStaticMarkup(decorated)
        )
        if (typeof markup !== 'string' || markup.length === 0) {
          throw new Error('renderToStaticMarkup produced empty markup')
        }
        const outputPath = resolve(
          OUTPUT_DIR,
          `${moduleId}-${storyName.replaceAll(/[^a-zA-Z0-9]+/g, '-')}.html`
        )
        writeFileSync(
          outputPath,
          htmlDocument(markup, css, buildWaiverDirective(story))
        )
        rendered++
        fileRendered++
      } catch (err) {
        fileFailed++
        failures.push({ file: rel, story: storyName, error: trimError(err) })
      }
    }

    rows.push({ file: rel, rendered: fileRendered, failed: fileFailed })
  }

  // Every failure must be either fixed or explicitly excluded with a reason
  // (.impeccable/render-exclusions.json, enforced by the REP-1657 guard
  // test). Uncovered failures are reported loudly and fail the run.
  const exclusions = loadRenderExclusions(log)
  const exclusionKeys = new Set(
    exclusions
      .filter(entry => entry.reason.trim() !== '')
      .map(entry => `${entry.file}#${entry.story}`)
  )
  const unexpected = failures.filter(
    failure => !exclusionKeys.has(`${failure.file}#${failure.story}`)
  )
  const manifest = {
    rendered,
    failed: failures.length,
    excluded: failures.length - unexpected.length,
    unexpected,
    failures,
  }
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n')

  // Summary table to stdout (progress logs go to stderr).
  const width = Math.max(...rows.map(row => row.file.length), 'file'.length)
  console.log(`story file${' '.repeat(width - 4)} rendered failed`)
  console.log('-'.repeat(width + 16))
  for (const row of rows) {
    console.log(
      `${row.file.padEnd(width)} ${String(row.rendered).padStart(8)} ${String(
        row.failed
      ).padStart(6)}`
    )
  }
  console.log('-'.repeat(width + 16))
  const totalRendered = rows.reduce((sum, row) => sum + row.rendered, 0)
  console.log(
    `${'total'.padEnd(width)} ${String(totalRendered).padStart(8)} ${String(
      failures.length
    ).padStart(6)}`
  )
  console.log(
    `${manifest.rendered} rendered, ${manifest.failed} failed (${manifest.excluded} excluded, ${unexpected.length} unexpected) across ${files.length} story file(s). Manifest: ${MANIFEST_PATH}`
  )

  if (rendered === 0) {
    console.error('ERROR: no stories rendered — the harness is broken.')
    process.exitCode = 1
  }
  if (manifest.failed > rendered) {
    console.error(
      `ERROR: ${manifest.failed} failures outnumber ${rendered} rendered stories — the harness is broken, not the stories.`
    )
    process.exitCode = 1
  }
  if (unexpected.length > 0) {
    console.error(
      `ERROR: ${
        unexpected.length
      } render failure(s) are neither fixed nor excluded in ${relativeFile(
        EXCLUSIONS_PATH
      )} — they contribute zero detector coverage:`
    )
    for (const failure of unexpected) {
      console.error(`  - ${failure.file} :: ${failure.story}: ${failure.error}`)
    }
    console.error(
      'Fix the failure or add a reasoned {file, story, reason} entry to the exclusion registry.'
    )
    process.exitCode = 1
  }

  return {
    rendered: manifest.rendered,
    failed: manifest.failed,
    excluded: manifest.excluded,
    unexpected: unexpected.length,
  }
}

async function main(): Promise<void> {
  try {
    await runRender()
  } catch (err) {
    console.error(`ERROR: ${err instanceof Error ? err.message : String(err)}`)
    process.exitCode = 1
  }
}

const isDirectRun =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isDirectRun) {
  void main()
}
