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
})
