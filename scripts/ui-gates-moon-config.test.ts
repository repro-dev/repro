/**
 * Pins the REP-1648 UI-gate task configuration in the root moon.yml
 * (review fixes 2 and 10):
 *
 * - all three browser ui-gates tasks must run with `options.cache: false` —
 *   they boot live servers and drive real browsers, so a cached pass/fail
 *   could mask a change (e.g. an untracked baseline);
 * - the two tasks that boot a Storybook dev server share the
 *   `storybook-server` mutex so parallel affected runs cannot race for the
 *   :6099 port family, while `ui-gates-route-smoke` (separate ports, no
 *   Storybook) stays outside the mutex;
 * - no task uses brace-expansion globs — moon v2 rejects `{a,b}` patterns,
 *   so extensions are enumerated instead.
 *
 * The parsed runtime shape was verified with `moon query tasks --id ...`
 * (options.cache/mutex round-trip); this test pins the source config so a
 * later edit cannot silently drop either setting.
 *
 * Run:
 *   node --test scripts/ui-gates-moon-config.test.ts
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
)

const moonConfig = readFileSync(path.join(repoRoot, 'moon.yml'), 'utf8')

/**
 * Extract the top-level task blocks from the `tasks:` section of the root
 * moon.yml. Task keys sit at exactly two-space indent; the section ends at
 * the next zero-indent key (`toolchains:`).
 */
function readTaskBlocks(text: string): Map<string, string> {
  const lines = text.split(/\r?\n/)
  const tasksStart = lines.findIndex(line => line === 'tasks:')
  assert.ok(tasksStart >= 0, 'moon.yml must declare a tasks: section')

  const blocks = new Map<string, string>()
  let currentKey: string | null = null
  let buffer: string[] = []

  const flush = () => {
    if (currentKey !== null) {
      blocks.set(currentKey, buffer.join('\n'))
    }
  }

  for (const line of lines.slice(tasksStart + 1)) {
    // Zero-indent key = the section after tasks: is starting.
    if (/^[A-Za-z]/.test(line)) break

    const taskKey = line.match(/^  ([\w-]+):$/)
    if (taskKey) {
      flush()
      currentKey = taskKey[1]!
      buffer = []
    } else if (currentKey !== null) {
      buffer.push(line)
    }
  }
  flush()

  return blocks
}

/** The `options:` subsection of a task block (children at 6-space indent). */
function optionsBlock(taskBlock: string): string {
  const match = taskBlock.match(/options:\n((?:      .*\n?)+)/)
  assert.ok(match, 'expected an options: subsection in the task block')
  return match[1]!
}

const taskBlocks = readTaskBlocks(moonConfig)

/** The `glob: <pattern>` values of a task block, in declaration order. */
function inputGlobs(taskBlock: string): string[] {
  return (taskBlock.match(/glob: (.+)/g) ?? []).map(line =>
    line.replace(/^glob: /, '').trim()
  )
}

/**
 * Translate the glob subset the UI-gate inputs use (`*` = within one path
 * segment, `**` = any number of segments, `**` at the end = anything under
 * the prefix) into a RegExp. Approximation for pinning purposes only — moon
 * is the authority on matching at runtime.
 */
function globToRegExp(glob: string): RegExp {
  let pattern = ''
  let index = 0

  while (index < glob.length) {
    if (glob.startsWith('**/', index)) {
      pattern += '(?:[^/]+/)*'
      index += 3
    } else if (glob.startsWith('**', index)) {
      pattern += '.*'
      index += 2
    } else if (glob[index] === '*') {
      pattern += '[^/]*'
      index += 1
    } else {
      pattern += glob[index]!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      index += 1
    }
  }

  return new RegExp(`^${pattern}$`)
}

/**
 * True when at least one of the task's input globs covers `filePath` —
 * i.e. a change to that file marks the task affected.
 */
function anyGlobCovers(taskBlock: string, filePath: string): boolean {
  const regexes = inputGlobs(taskBlock).map(glob => globToRegExp(glob))
  return regexes.some(regex => regex.test(filePath))
}

describe('REP-1648 UI-gate moon tasks (root moon.yml)', () => {
  it('declares all three browser gate tasks', () => {
    for (const task of [
      'ui-gates-visual-regression',
      'ui-gates-storybook',
      'ui-gates-route-smoke',
    ]) {
      assert.ok(
        taskBlocks.has(task),
        `root moon.yml must declare the ${task} task`
      )
    }
  })

  it('runs every browser gate with options.cache: false', () => {
    for (const task of [
      'ui-gates-visual-regression',
      'ui-gates-storybook',
      'ui-gates-route-smoke',
    ]) {
      const options = optionsBlock(taskBlocks.get(task)!)
      assert.match(
        options,
        /^      cache: false$/m,
        `${task} must set options.cache: false — these tasks boot live servers and drive real browsers, so a cached result could mask a change`
      )
    }
  })

  it('serializes the two Storybook-booting tasks on a shared mutex', () => {
    const mutex = /^      mutex: 'storybook-server'$/m

    for (const task of ['ui-gates-visual-regression', 'ui-gates-storybook']) {
      const options = optionsBlock(taskBlocks.get(task)!)
      assert.match(
        options,
        mutex,
        `${task} boots a Storybook dev server in the :6099 port family and must hold the storybook-server mutex`
      )
    }

    assert.equal(
      taskBlocks
        .get('ui-gates-visual-regression')!
        .match(/mutex: '([^']+)'/)?.[1],
      taskBlocks.get('ui-gates-storybook')!.match(/mutex: '([^']+)'/)?.[1],
      'the two Storybook-booting tasks must share ONE mutex value to serialize them'
    )
  })

  it('keeps the route-smoke task outside the Storybook mutex', () => {
    const options = optionsBlock(taskBlocks.get('ui-gates-route-smoke')!)
    assert.doesNotMatch(
      options,
      /mutex:/,
      'route-smoke serves its apps on 7080/7081 and never boots Storybook — it must not hold the storybook-server mutex'
    )
  })

  it('uses no brace-expansion globs (moon v2 rejects them)', () => {
    for (const [task, block] of taskBlocks) {
      const globLines = block.match(/glob: .+/g) ?? []
      for (const line of globLines) {
        assert.doesNotMatch(
          line,
          /\{/,
          `${task} glob "${line.trim()}" must not use brace expansion — moon v2 forbids {a,b} globs; enumerate extensions instead`
        )
      }
    }
  })

  it('runs the CI visual gate fail-closed on new stories', () => {
    const block = taskBlocks.get('ui-gates-visual-regression')!
    assert.match(
      block,
      /--fail-on-new/,
      'the CI visual-regression task must pass --fail-on-new so a new story without a committed baseline fails closed'
    )
  })

  it('marks all three tasks affected via broad source globs, not enumerated extensions', () => {
    // Any file under packages/*/src or apps/*/src must mark the gate tasks
    // affected — including non-ts/tsx/mdx/css rendered assets (svg, png,
    // json, yml, less, hbs, …). Enumerated extension globs silently miss
    // every other asset type, so a new asset could land unrendered.
    for (const task of [
      'ui-gates-visual-regression',
      'ui-gates-storybook',
      'ui-gates-route-smoke',
    ]) {
      const block = taskBlocks.get(task)!
      const globs = inputGlobs(block)

      for (const broadGlob of ['packages/*/src/**', 'apps/*/src/**']) {
        assert.ok(
          globs.includes(broadGlob),
          `${task} must declare the broad source glob "${broadGlob}" so any file (including non-ts/tsx/mdx/css assets) under it marks the task affected`
        )
      }
    }
  })

  it('covers representative non-ts/tsx/mdx/css assets under packages/*/src and apps/*/src', () => {
    // Behavioral pin over the declared globs: these are the asset classes
    // the storybook/vite render pipeline can pick up from a src directory.
    const assetFiles = [
      'packages/design/src/DragHandle/drag-handle.svg',
      'packages/design/src/DropdownMenu/menu.json',
      'packages/playback/src/PlaybackNavigation/transport.less',
      'packages/agentic-ui/src/agent.config.yml',
      'packages/devtools/src/template.hbs',
      'apps/workspace/src/styles/theme.scss',
      'apps/admin/src/assets/logo.png',
      'apps/admin/src/banner.webp',
    ]

    for (const task of [
      'ui-gates-visual-regression',
      'ui-gates-storybook',
      'ui-gates-route-smoke',
    ]) {
      for (const file of assetFiles) {
        assert.ok(
          anyGlobCovers(taskBlocks.get(task)!, file),
          `${task} inputs must cover "${file}" — a non-ts/tsx asset change must mark the task affected`
        )
      }
    }
  })

  it('still covers ts/tsx source after the broad-glob switch', () => {
    const sourceFiles = [
      'packages/domain/src/models.ts',
      'packages/design/src/Button.tsx',
      'apps/workspace/src/App.tsx',
    ]

    for (const task of [
      'ui-gates-visual-regression',
      'ui-gates-storybook',
      'ui-gates-route-smoke',
    ]) {
      for (const file of sourceFiles) {
        assert.ok(
          anyGlobCovers(taskBlocks.get(task)!, file),
          `${task} inputs must still cover "${file}"`
        )
      }
    }
  })
})

describe('REP-1648 static Storybook serving (moon task deps)', () => {
  /**
   * The `deps:` entries of a task block. Scoped precisely: list items sit at
   * 6-space indent after the 4-space `deps:` key, and the section ends at
   * the next 4-space section key (`inputs:`, `options:` …) — so input globs
   * can never read as deps.
   */
  function deps(taskBlock: string): string[] {
    const lines = taskBlock.split('\n')
    const start = lines.findIndex(line => line === '    deps:')
    assert.ok(start >= 0, 'expected a deps: section in the task block')

    const entries: string[] = []
    for (const line of lines.slice(start + 1)) {
      if (/^    \S/.test(line)) break
      const dep = line.match(/^      - (.+)$/)
      if (dep) entries.push(dep[1]!.trim())
    }
    return entries
  }

  it('builds repro/storybook-ui before both Storybook-consuming gates', () => {
    // The wrappers serve the PREBUILT storybook-static output (REP-1648
    // static-serving fix); without this dep the gate runs against a missing
    // or stale bundle.
    for (const task of ['ui-gates-visual-regression', 'ui-gates-storybook']) {
      const taskDeps = deps(taskBlocks.get(task)!)
      assert.ok(
        taskDeps.includes('repro/storybook-ui:build'),
        `${task} must depend on repro/storybook-ui:build — the gate serves the prebuilt storybook-static bundle`
      )
    }
  })

  it('keeps the generated-artifact deps consumed by the Storybook graph', () => {
    for (const task of ['ui-gates-visual-regression', 'ui-gates-storybook']) {
      const taskDeps = deps(taskBlocks.get(task)!)

      for (const dep of [
        'repro/domain:build',
        'repro/wire-formats:build',
        'repro/tdl:build',
      ]) {
        assert.ok(
          taskDeps.includes(dep),
          `${task} must keep its ${dep} generated-artifact dep`
        )
      }
    }
  })
})
