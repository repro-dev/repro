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
// Exit codes: 1 when nothing rendered (harness broken) or when failures
// outnumber rendered stories (majority-failure means the harness is broken,
// not the stories); 0 otherwise.
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { cacheSingleton } from '@jsxstyle/core'
import { createElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = resolve(__dirname, '..')
export const OUTPUT_DIR = resolve(REPO_ROOT, 'tmp/storybook-html')
export const MANIFEST_PATH = resolve(OUTPUT_DIR, 'manifest.json')

const EXCLUDED_DIRS = new Set(['node_modules', 'dist', 'storybook-static'])
const STORY_FILE_PATTERN = /\.stories\.tsx$/

/** Error text trimmed to keep the manifest readable. */
function trimError(err: unknown): string {
  const text = String(err instanceof Error ? err.message : err)
  return text.length > 500 ? `${text.slice(0, 500)}…` : text
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

/**
 * CSF decorators wrap the story element: the FIRST decorator in the array is
 * the outermost wrapper. Each decorator receives a Story function returning
 * the element so far plus the story context.
 */
export function applyStoryDecorators(
  element: ReactElement,
  decorators: unknown[],
  story: Record<string, unknown>
): ReactElement {
  const context = {
    args:
      story.args && typeof story.args === 'object'
        ? (story.args as Record<string, unknown>)
        : {},
    parameters: story.parameters,
    id: story.name,
  }
  let current: ReactNode = element
  for (const decorator of [...decorators].reverse()) {
    if (typeof decorator !== 'function') continue
    const Story = (): ReactNode => current
    const wrapped = (
      decorator as (story: () => ReactNode, context: unknown) => ReactNode
    )(Story, context)
    if (wrapped !== undefined && wrapped !== null) current = wrapped
  }
  return current as ReactElement
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

function htmlDocument(markup: string, css: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${markup}</body></html>`
}

export async function runRender(
  options: { log?: (msg: string) => void } = {}
): Promise<{
  rendered: number
  failed: number
}> {
  const log = options.log ?? ((msg: string) => console.error(msg))
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
    let fileRendered = 0
    let fileFailed = 0

    for (const [storyName, storyExport] of Object.entries(moduleExports)) {
      if (storyName === 'default') continue
      if (!isStoryObject(storyExport)) continue
      try {
        const story = storyExport
        const args =
          story.args && typeof story.args === 'object'
            ? (story.args as Record<string, unknown>)
            : {}
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
            ? applyStoryDecorators(element, story.decorators, story)
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
        writeFileSync(outputPath, htmlDocument(markup, css))
        rendered++
        fileRendered++
      } catch (err) {
        fileFailed++
        failures.push({ file: rel, story: storyName, error: trimError(err) })
      }
    }

    rows.push({ file: rel, rendered: fileRendered, failed: fileFailed })
  }

  const manifest = {
    rendered,
    failed: failures.length,
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
    `${manifest.rendered} rendered, ${manifest.failed} failed across ${files.length} story file(s). Manifest: ${MANIFEST_PATH}`
  )

  if (rendered === 0) {
    console.error('ERROR: no stories rendered — the harness is broken.')
    process.exitCode = 1
  } else if (manifest.failed > rendered) {
    console.error(
      `ERROR: ${manifest.failed} failures outnumber ${rendered} rendered stories — the harness is broken, not the stories.`
    )
    process.exitCode = 1
  }

  return { rendered: manifest.rendered, failed: manifest.failed }
}

async function main(): Promise<void> {
  await runRender()
}

const isDirectRun =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isDirectRun) {
  void main()
}
