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
 * It also pins the build inputs of `repro/storybook-ui:build` (review
 * follow-up): without explicit inputs the task would only hash files within
 * the storybook-ui project, so a changed story/component in `packages/*` or
 * `apps/*` outside its workspace-dep closure would leave a stale
 * storybook-static bundle served by the gates.
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

// The `tasks:` blocks of apps/storybook-ui/moon.yml (same parser — task keys
// at 2-space indent, section ends at the zero-indent `toolchains:` key).
const storybookMoonConfig = readFileSync(
  path.join(repoRoot, 'apps/storybook-ui', 'moon.yml'),
  'utf8'
)
const storybookTaskBlocks = readTaskBlocks(storybookMoonConfig)

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

describe('REP-1648 Storybook build inputs (apps/storybook-ui/moon.yml)', () => {
  /**
   * The build task's declared input globs, verbatim. The leading `/` is
   * load-bearing: moon treats it as a workspace-root-relative glob (moon
   * docs "File patterns > Workspace relative"; `../` escapes are invalid),
   * so the bare project-relative form would resolve inside
   * apps/storybook-ui and silently match nothing. storybookInputGlobs drops
   * that slash so behavioral checks use the canonical workspace-relative
   * paths the root-config tests above do.
   */
  function storybookRawInputGlobs(): string[] {
    return inputGlobs(storybookTaskBlocks.get('build')!)
  }

  function storybookInputGlobs(): string[] {
    return storybookRawInputGlobs().map(glob => glob.replace(/^\//, ''))
  }

  function storybookAnyGlobCovers(filePath: string): boolean {
    const regexes = storybookInputGlobs().map(glob => globToRegExp(glob))
    return regexes.some(regex => regex.test(filePath))
  }

  it('declares explicit inputs on the build task', () => {
    // When inputs are declared they REPLACE the implicit "all files within
    // the project" default — which is exactly why every story/component
    // source outside the storybook-ui project must be re-declared here.
    assert.ok(
      storybookRawInputGlobs().length > 0,
      'repro/storybook-ui:build must declare explicit inputs — without them only files inside apps/storybook-ui hash, and changed stories/components in packages/* or apps/* outside its workspace-dep closure leave a stale storybook-static bundle served by the gates'
    )
  })

  it('covers broad package and app story sources', () => {
    // .storybook/main.js stories globs span packages/*/src and apps/*/src;
    // the inputs must mirror that breadth (broad globs, not extensions) and
    // be workspace-root-relative (leading `/`).
    const globs = storybookRawInputGlobs()

    for (const broadGlob of ['/packages/*/src/**', '/apps/*/src/**']) {
      assert.ok(
        globs.includes(broadGlob),
        `repro/storybook-ui:build inputs must include the broad workspace-relative glob "${broadGlob}" so any story/component change (including non-ts/tsx/mdx/css assets) invalidates the bundle — without the leading / the glob is project-relative and matches nothing`
      )
    }

    for (const source of [
      'packages/design/src/Card/Card.stories.tsx',
      'packages/design/src/tokens/Tokens.mdx',
      'apps/capture/src/components/Widget/ReportForm/ProgressOverlay.stories.tsx',
    ]) {
      assert.ok(
        storybookAnyGlobCovers(source),
        `repro/storybook-ui:build inputs must cover "${source}"`
      )
    }
  })

  it('covers the Storybook project’s own config and package files', () => {
    // Explicit inputs replace the implicit project-wide default, so the
    // files the build consumes inside apps/storybook-ui must be declared.
    const globs = storybookRawInputGlobs()
    for (const ownGlob of [
      '/apps/storybook-ui/.storybook/**',
      '/apps/storybook-ui/package.json',
    ]) {
      assert.ok(
        globs.includes(ownGlob),
        `repro/storybook-ui:build inputs must include "${ownGlob}" — its own consumed files are no longer implicit once inputs are declared`
      )
    }

    for (const file of [
      'apps/storybook-ui/.storybook/main.js',
      'apps/storybook-ui/.storybook/preview.js',
      'apps/storybook-ui/package.json',
    ]) {
      assert.ok(
        storybookAnyGlobCovers(file),
        `repro/storybook-ui:build inputs must cover "${file}"`
      )
    }
  })

  it('covers app entry/config inputs and the lockfile', () => {
    for (const required of [
      '/apps/*/index.html',
      '/apps/*/vite.config.ts',
      '/pnpm-lock.yaml',
    ]) {
      assert.ok(
        storybookRawInputGlobs().includes(required),
        `repro/storybook-ui:build inputs must include "${required}" (established by the root UI-gate input patterns)`
      )
    }
  })

  it('excludes the generated storybook-static output from inputs', () => {
    // storybook-static is the task's OUTPUT; hashing it as an input would
    // make every build invalidate the next one, and a glob that broad would
    // also pin generated artifacts as build-relevant sources.
    const buildBlock = storybookTaskBlocks.get('build')!
    for (const glob of inputGlobs(buildBlock)) {
      assert.doesNotMatch(
        glob,
        /storybook-static/,
        `repro/storybook-ui:build input glob "${glob}" must not cover the generated storybook-static output`
      )
    }

    assert.equal(
      storybookAnyGlobCovers('apps/storybook-ui/storybook-static/index.html'),
      false,
      'no declared input glob may match files under apps/storybook-ui/storybook-static'
    )
  })

  it('keeps the build cacheable and still serving the static bundle', () => {
    const buildBlock = storybookTaskBlocks.get('build')!
    assert.match(
      optionsBlock(buildBlock),
      /^      cache: true$/m,
      'repro/storybook-ui:build must stay cache: true — explicit inputs make the cache valid, not redundant'
    )

    assert.match(
      buildBlock,
      /    outputs:\n      - storybook-static/,
      'repro/storybook-ui:build must keep storybook-static as its output — the UI gates serve that prebuilt bundle'
    )
  })
})
