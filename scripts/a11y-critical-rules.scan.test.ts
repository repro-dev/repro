/**
 * Repo-wide story a11y suppression scan (REP-1648 review fix 2, tracked
 * under REP-1685):
 *
 * - any story file that suppresses or overrides a11y (blanket disable,
 *   named disable, or options.rules / config.rules `enabled: false`) must
 *   carry the REP-1685 tracking reference;
 * - PlaybackNavigation must retain REP-1680;
 * - unrelated docs/table disable settings (argTypes
 *   `table: { disable: true }`, `docs.disable`) are NOT a11y suppressions
 *   and are never flagged.
 *
 * Guards ensure the sweep is not vacuous: it must walk a sane number of
 * story files and still detect the six known suppression files.
 *
 * Run:
 *   node --test scripts/a11y-critical-rules.scan.test.ts
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  SUPPRESSED_STORIES,
  collectStoryFiles,
  findA11ySuppressions,
} from './storybook-a11y-scan.ts'

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
)

describe('findA11ySuppressions (repo-wide scan primitive)', () => {
  it('flags a blanket a11y disable', () => {
    const source = [
      'const meta = {',
      '  parameters: {',
      '    a11y: { disable: true },',
      '  },',
      '}',
    ].join('\n')

    assert.deepEqual(
      findA11ySuppressions(source).map(s => s.kind),
      ['blanket-disable']
    )
  })

  it('flags a named options.rules override', () => {
    const source = [
      'parameters: {',
      '  a11y: {',
      '    options: {',
      "      rules: { 'button-name': { enabled: false } },",
      '    },',
      '  },',
      '}',
    ].join('\n')

    assert.deepEqual(
      findA11ySuppressions(source).map(s => s.kind),
      ['rule-override']
    )
  })

  it('flags a named config.rules override', () => {
    const source = [
      'parameters: {',
      '  a11y: {',
      '    config: {',
      '      rules: { label: { enabled: false } },',
      '    },',
      '  },',
      '}',
    ].join('\n')

    assert.deepEqual(
      findA11ySuppressions(source).map(s => s.kind),
      ['rule-override']
    )
  })

  it('flags an array-valued named disable as a rule suppression', () => {
    const source = "parameters: { a11y: { disable: ['button-name'] } }"

    const suppressions = findA11ySuppressions(source)

    assert.deepEqual(
      suppressions.map(s => s.kind),
      ['rule-override'],
      'disable: [<rule ids>] suppresses named rules, not the whole check'
    )
    assert.match(suppressions[0]!.snippet, /button-name/)
  })

  it('flags a string-valued named disable as a rule suppression', () => {
    assert.deepEqual(
      findA11ySuppressions(
        "parameters: { a11y: { disable: 'button-name' } }"
      ).map(s => s.kind),
      ['rule-override']
    )
    assert.deepEqual(
      findA11ySuppressions('parameters: { a11y: { disable: "label" } }').map(
        s => s.kind
      ),
      ['rule-override']
    )
  })

  it('does not flag an explicit `disable: false` re-enable', () => {
    const source = 'parameters: { a11y: { disable: false } }'

    assert.deepEqual(findA11ySuppressions(source), [])
  })

  it('emits one entry per kind when several patterns hit one block', () => {
    const source = [
      'parameters: {',
      '  a11y: {',
      '    options: {',
      "      rules: { 'button-name': { enabled: false } },",
      '    },',
      "    disable: ['label'],",
      '  },',
      '}',
    ].join('\n')

    assert.deepEqual(
      findA11ySuppressions(source).map(s => s.kind),
      ['rule-override'],
      'the same block must not be counted twice for the same kind'
    )
  })

  it('does not flag unrelated docs/table disable settings', () => {
    // `table: { disable: true }` under argTypes and `docs.disable` are
    // rendering settings, not a11y suppressions.
    const source = [
      'argTypes: {',
      '  options: { table: { disable: true } },',
      '  value: { table: { disable: true } },',
      '},',
      'parameters: {',
      '  docs: { disable: true },',
      '  a11y: {',
      '    options: {',
      "      rules: { 'button-name': { enabled: true } },",
      '    },',
      '  },',
      '}',
    ].join('\n')

    assert.deepEqual(findA11ySuppressions(source), [])
  })

  it('does not flag identifiers that merely contain a11y', () => {
    // `pa11yCheck:` must not open an a11y block — only a bare `a11y` key
    // (or quoted variant) does. `myA11y` differs by case and is skipped too.
    const source = [
      'const props = {',
      '  pa11yCheck: { disable: true },',
      '  myA11y: { disable: true },',
      '}',
    ].join('\n')

    assert.deepEqual(findA11ySuppressions(source), [])
  })

  it("flags the quoted `'a11y':` key form", () => {
    const source = "parameters: { 'a11y': { disable: true } }"
    assert.deepEqual(
      findA11ySuppressions(source).map(s => s.kind),
      ['blanket-disable']
    )
  })

  it('over-captures an unbalanced a11y block instead of skipping a suppression', () => {
    // A comment/string with unmatched braces leaves depth > 0 at EOF; the
    // scanner must over-capture to EOF (loud false positive at worst) —
    // skipping would silently miss the suppression.
    const source = [
      'parameters: {',
      '  a11y: {',
      "    label: 'renders { without { a close',",
      "    options: { rules: { 'button-name': { enabled: false } } },",
      '  },',
      '}',
    ].join('\n')

    assert.deepEqual(
      findA11ySuppressions(source).map(s => s.kind),
      ['rule-override'],
      'an unbalanced block must over-capture to EOF — a suppression must never be silently missed'
    )
  })
})

describe('repo-wide story a11y suppression scan (REP-1685)', () => {
  const storyFiles = collectStoryFiles([
    path.join(repoRoot, 'packages'),
    path.join(repoRoot, 'apps'),
  ])

  const suppressingFiles = storyFiles
    .map(file => ({ file, source: fs.readFileSync(file, 'utf8') }))
    .filter(({ source }) => findA11ySuppressions(source).length > 0)

  it('walks a sane number of story files (guard against a broken walker)', () => {
    assert.ok(
      storyFiles.length > 50,
      `expected >50 story files, walked ${storyFiles.length} — the scan is silently vacuous below this`
    )
  })

  it('detects the six known suppression files (guard against under-detection)', () => {
    for (const known of SUPPRESSED_STORIES) {
      assert.ok(
        suppressingFiles.some(({ file }) => file.endsWith(known.file)),
        `scanner must detect the known suppression file ${known.file}`
      )
    }
  })

  it('does not flag unrelated table disable settings as suppressions', () => {
    // Select.stories.tsx disables argTypes tables (`table: { disable: true }`)
    // — a docs rendering setting that must not demand a tracking reference.
    assert.equal(
      suppressingFiles.find(({ file }) => file.endsWith('Select.stories.tsx')),
      undefined,
      'argTypes table disable must not read as an a11y suppression'
    )
  })

  it('every story file with an a11y suppression carries REP-1685', () => {
    assert.ok(
      suppressingFiles.length > 0,
      'the known suppressions must be present for this scan to run'
    )

    for (const { file, source } of suppressingFiles) {
      assert.ok(
        source.includes('REP-1685'),
        `${path.relative(
          repoRoot,
          file
        )} suppresses/overrides a11y but carries no REP-1685 reference — add the tracking id to the suppression reason`
      )
    }
  })

  it('PlaybackNavigation keeps its REP-1680 reference', () => {
    const navigation = suppressingFiles.find(({ file }) =>
      file.endsWith('PlaybackNavigation.stories.tsx')
    )

    assert.ok(
      navigation,
      'the PlaybackNavigation suppression must still be detected'
    )
    assert.ok(
      navigation.source.includes('REP-1680'),
      'PlaybackNavigation a11y fix is tracked under REP-1680 — the story must keep that reference'
    )
  })
})
