import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'

import {
  assertAuditArtifacts,
  type AssertInputs,
  type AssertReport,
} from './assert-audit-artifacts.ts'

// Pure-core tests (REP-1653): clock-free (commitTimeMs is a literal) and
// fs-injectable (fixtures under a temp worktree root). CLI parsing/IO tests
// live in assert-audit-artifacts.cli.test.ts, mirroring the classify split.

const GENERATED_AT = '2026-09-02T12:00:00.000Z'
const COMMIT_TIME_MS = Date.parse('2026-09-02T11:00:00.000Z') // 1h older
const SHOT_DIR = 'tmp/ui-verification/REP-0000/shots'
const SHOT_REL = `${SHOT_DIR}/sessions-idle.png`
const AUDIT_HEADER =
  '| pillar | severity | evidence screenshot | description | disposition |'
const AUDIT_SEPARATOR = '| --- | --- | --- | --- | --- |'
const SENTINEL = '| none | none | none | no findings | none |'

const VALID_MANIFEST = {
  issue: 'REP-0000',
  generatedAt: GENERATED_AT,
  base: 'origin/main',
  agentBrowserVersion: '1.2.3',
  canary: 'pass',
  surfaces: [
    {
      surface: 'workspace::Sessions',
      url: 'http://localhost:3000/sessions',
      viewport: '1440x900',
      states: [
        {
          state: 'idle',
          screenshot: SHOT_REL,
          interactionNotes: 'loaded, no interaction',
        },
      ],
    },
  ],
}

const VALID_AUDIT = [
  AUDIT_HEADER,
  AUDIT_SEPARATOR,
  `| layout | P1 | ${SHOT_REL} | header overlaps toolbar | fixed abc1234 |`,
  '',
].join('\n')

const findingRow = (disposition: string) =>
  `| layout | P1 | ${SHOT_REL} | header overlaps toolbar | ${disposition} |`

const manifestWith = (states: unknown) => ({
  ...VALID_MANIFEST,
  surfaces: [{ surface: 'workspace::Sessions', states }],
})

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'assert-audit-core-'))
  const auditDir = path.join(root, 'tmp', 'ui-verification', 'REP-0000')
  mkdirSync(path.join(root, SHOT_DIR), { recursive: true })
  writeFileSync(path.join(root, SHOT_REL), 'png-bytes')
  // Fixtures for the screenshot edge cases (zero byte + root escape).
  writeFileSync(path.join(root, SHOT_DIR, 'empty.png'), '')
  writeFileSync(path.join(root, 'outside.png'), 'x')

  return {
    root,
    auditDir,
    /** Re-write the artifacts and run the core against them. */
    run(overrides?: {
      manifest?: unknown
      /** Raw manifest.json content — use for malformed-JSON cases. */
      manifestText?: string
      auditText?: string
      inputs?: Partial<AssertInputs>
    }): AssertReport {
      writeFileSync(
        path.join(auditDir, 'manifest.json'),
        overrides?.manifestText ??
          JSON.stringify(overrides?.manifest ?? VALID_MANIFEST, null, 2)
      )
      writeFileSync(
        path.join(auditDir, 'audit.md'),
        overrides?.auditText ?? VALID_AUDIT
      )
      return assertAuditArtifacts({
        issueId: 'REP-0000',
        expectedSurfaces: ['workspace::Sessions'],
        classificationBase: 'origin/main',
        commitTimeMs: COMMIT_TIME_MS,
        worktreeRoot: root,
        ...overrides?.inputs,
      })
    },
  }
}

const ids = (report: AssertReport): string[] => report.results.map(r => r.id)

/** Assert one named assertion failed with a matching detail. */
function assertFails(
  report: AssertReport,
  id: string,
  detailRe: RegExp,
  message?: string
) {
  const failed = report.results.find(r => r.id === id)
  assert.equal(
    failed?.ok,
    false,
    `expected ${id} to fail in: ${ids(report)} ${message ?? ''}`
  )
  assert.match(failed?.detail ?? '', detailRe, `${id} detail ${message ?? ''}`)
}

describe('REP-1653 assertAuditArtifacts (pure core)', () => {
  let f: ReturnType<typeof fixture>

  beforeEach(() => {
    f = fixture()
  })
  afterEach(() => rmSync(f.root, { recursive: true, force: true }))

  it('passes with every assertion ok and stable ids in order', () => {
    const report = f.run()
    assert.equal(report.mode, 'assert-audit')
    assert.equal(report.issue, 'REP-0000')
    assert.equal(report.auditDir, f.auditDir)
    assert.equal(report.ok, true)
    assert.deepEqual(ids(report), [
      'manifest-parses',
      'manifest-nonempty',
      'screenshots',
      'canary',
      'freshness',
      'surface-coverage',
      'audit-findings',
    ])
    for (const result of report.results) {
      assert.equal(result.ok, true, result.id)
      assert.equal(result.detail, undefined, result.id)
    }
  })

  it('fails manifest-parses on malformed JSON, omitting manifest-derived assertions', () => {
    const report = f.run({ manifestText: '{ not json' })
    assert.equal(report.ok, false)
    // Fail-closed short-circuit: only the parse failure + audit-findings run.
    assert.deepEqual(ids(report), ['manifest-parses', 'audit-findings'])
    assertFails(report, 'manifest-parses', /not valid JSON/)
    assert.equal(report.results.find(r => r.id === 'audit-findings')?.ok, true)
  })

  it('fails manifest-parses fail-closed when manifest.json is missing', () => {
    // Only audit.md exists — the core must still fail closed on the manifest.
    writeFileSync(path.join(f.auditDir, 'audit.md'), VALID_AUDIT)
    const report = assertAuditArtifacts({
      issueId: 'REP-0000',
      expectedSurfaces: ['workspace::Sessions'],
      classificationBase: 'origin/main',
      commitTimeMs: COMMIT_TIME_MS,
      worktreeRoot: f.root,
    })
    assert.equal(report.ok, false)
    assert.deepEqual(ids(report), ['manifest-parses', 'audit-findings'])
    assertFails(report, 'manifest-parses', /unreadable/)
  })

  it('fails manifest-parses on a null JSON root instead of skipping the manifest assertions', () => {
    // Blocker regression: JSON.parse('null') === null collided with the
    // "not parsed" sentinel, so a `null` manifest recorded manifest-parses
    // as ok and skipped every manifest-derived assertion (fail-open gate).
    const report = f.run({ manifestText: 'null' })
    assert.equal(report.ok, false)
    assert.deepEqual(ids(report), ['manifest-parses', 'audit-findings'])
    assertFails(report, 'manifest-parses', /root is not an object \(null\)/)
    assert.equal(report.results.find(r => r.id === 'audit-findings')?.ok, true)
  })

  it('fails manifest-parses fail-closed for every other non-object JSON root', () => {
    for (const [text, type] of [
      ['42', 'number'],
      ['"x"', 'string'],
      ['true', 'boolean'],
      ['[]', 'array'],
    ] as const) {
      const report = f.run({ manifestText: text })
      assert.equal(report.ok, false, `root ${text}`)
      assert.deepEqual(
        ids(report),
        ['manifest-parses', 'audit-findings'],
        `root ${text}`
      )
      assertFails(
        report,
        'manifest-parses',
        new RegExp(`root is not an object \\(${type}\\)`),
        `(root ${text})`
      )
    }
  })

  it('fails manifest-nonempty on a non-object surfaces entry instead of throwing', () => {
    for (const [entry, type] of [
      [null, 'null'],
      [42, 'number'],
    ] as const) {
      const report = f.run({
        manifest: { ...VALID_MANIFEST, surfaces: [entry] },
      })
      assertFails(
        report,
        'manifest-nonempty',
        new RegExp(`surfaces\\[0\\] is not an object \\(${type}\\)`),
        `(entry ${String(entry)})`
      )
      // assert-all: the remaining assertions still ran and are reported.
      assert.ok(ids(report).includes('screenshots'))
      assert.ok(ids(report).includes('surface-coverage'))
    }
  })

  it('fails screenshots on a non-object states entry instead of throwing', () => {
    for (const [entry, type] of [
      [null, 'null'],
      ['oops', 'string'],
    ] as const) {
      const report = f.run({ manifest: manifestWith([entry]) })
      assertFails(
        report,
        'screenshots',
        new RegExp(
          `workspace::Sessions/states\\[0\\] is not an object \\(${type}\\)`
        ),
        `(entry ${String(entry)})`
      )
    }
  })

  it('reports malformed entries alongside valid-entry problems (assert-all)', () => {
    // Malformed surface entry + a real problem on the valid surface.
    const report = f.run({
      manifest: {
        ...VALID_MANIFEST,
        surfaces: [
          { surface: 'workspace::Sessions', states: [{ state: 's' }] },
          'garbage',
        ],
      },
    })
    assertFails(
      report,
      'manifest-nonempty',
      /surfaces\[1\] is not an object \(string\)/
    )
    assertFails(report, 'screenshots', /s: screenshot path missing or empty/)
    // Malformed state entry alongside a real screenshot problem.
    const withBadState = f.run({
      manifest: manifestWith([
        { state: 'missing', screenshot: `${SHOT_DIR}/nope.png` },
        null,
      ]),
    })
    assertFails(
      withBadState,
      'screenshots',
      /missing: screenshot does not exist.*states\[1\] is not an object \(null\)/s
    )
  })

  it('fails manifest-nonempty on empty surfaces or no surface with >=1 state', () => {
    for (const manifest of [
      { ...VALID_MANIFEST, surfaces: [] },
      manifestWith([]),
    ]) {
      assertFails(f.run({ manifest }), 'manifest-nonempty', /.+/)
    }
  })

  it('fails missing/empty screenshots, missing or zero-byte files, and escaping paths', () => {
    const cases: Array<
      [string, RegExp, Array<{ state: string; screenshot?: unknown }>]
    > = [
      ['missing value', /missing or empty/, [{ state: 's' }]],
      ['empty string', /missing or empty/, [{ state: 's', screenshot: '' }]],
      [
        'nonexistent file',
        /does not exist/,
        [{ state: 's', screenshot: `${SHOT_DIR}/nope.png` }],
      ],
      [
        'zero-byte file',
        /0 bytes/,
        [{ state: 'z', screenshot: `${SHOT_DIR}/empty.png` }],
      ],
      [
        'root-escaping path',
        /escapes the worktree root/,
        [{ state: 'e', screenshot: '../outside.png' }],
      ],
      [
        'absolute path',
        /absolute path/,
        [{ state: 'a', screenshot: '/etc/hosts' }],
      ],
    ]
    for (const [label, detailRe, states] of cases) {
      assertFails(
        f.run({ manifest: manifestWith(states) }),
        'screenshots',
        detailRe,
        `(${label})`
      )
    }
  })

  it('lists every offending screenshot state, not just the first', () => {
    assertFails(
      f.run({
        manifest: manifestWith([
          { state: 'missing', screenshot: `${SHOT_DIR}/nope.png` },
          { state: 'zero-byte', screenshot: `${SHOT_DIR}/empty.png` },
        ]),
      }),
      'screenshots',
      /missing.*does not exist.*zero-byte.*0 bytes/s
    )
  })

  it('resolves screenshot paths against the configured worktree root, not cwd', () => {
    // Same relative path, but a worktree root without the artifacts.
    const report = assertAuditArtifacts({
      issueId: 'REP-0000',
      expectedSurfaces: ['workspace::Sessions'],
      classificationBase: 'origin/main',
      commitTimeMs: COMMIT_TIME_MS,
      worktreeRoot: path.dirname(f.root),
    })
    assert.equal(report.ok, false)
    assertFails(report, 'manifest-parses', /unreadable/)
  })

  it('fails when canary is not "pass" or agentBrowserVersion is missing/empty', () => {
    for (const [canary, agentBrowserVersion] of [
      ['fail', '1.2.3'],
      [undefined, '1.2.3'],
      ['pass', undefined],
      ['pass', ''],
    ] as const) {
      assertFails(
        f.run({ manifest: { ...VALID_MANIFEST, canary, agentBrowserVersion } }),
        'canary',
        /canary|agentBrowserVersion/
      )
    }
  })

  it('fails freshness on a base mismatch', () => {
    assertFails(
      f.run({ manifest: { ...VALID_MANIFEST, base: 'feature/branch' } }),
      'freshness',
      /base.*classification base/s
    )
  })

  it('fails when generatedAt is missing, non-ISO, or not strictly newer', () => {
    // Strictness: the same millisecond as the commit is NOT newer.
    const cases: Array<[string, unknown]> = [
      ['missing', undefined],
      ['non-ISO', '2026-09-02 noon'],
      ['older', '2026-09-02T10:00:00.000Z'],
      ['same-ms', '2026-09-02T11:00:00.000Z'],
    ]
    for (const [label, generatedAt] of cases) {
      assertFails(
        f.run({ manifest: { ...VALID_MANIFEST, generatedAt } }),
        'freshness',
        /generatedAt|base/s,
        `(${label})`
      )
    }
  })

  it('passes a strictly newer timestamp', () => {
    const report = f.run({
      manifest: { ...VALID_MANIFEST, generatedAt: '2026-09-02T11:00:00.001Z' },
    })
    assert.equal(report.results.find(r => r.id === 'freshness')?.ok, true)
  })

  it('fails surface-coverage naming the expected surface missing from the manifest', () => {
    assertFails(
      f.run({
        inputs: { expectedSurfaces: ['workspace::Sessions', 'admin::Billing'] },
      }),
      'surface-coverage',
      /admin::Billing/
    )
  })

  it('allows manifest surfaces beyond the expected set (superset semantics)', () => {
    const report = f.run({
      manifest: {
        ...VALID_MANIFEST,
        surfaces: [
          ...VALID_MANIFEST.surfaces,
          {
            surface: 'admin::Billing',
            states: [{ state: 'idle', screenshot: SHOT_REL }],
          },
        ],
      },
    })
    assert.equal(report.ok, true)
  })

  it('classifies finding rows, the sentinel, and dispositions', () => {
    const cases: Array<[string, string, boolean, RegExp]> = [
      [
        'fixed + filed dispositions',
        `${findingRow('fixed abc1234')}\n${findingRow('filed REP-1650')}`,
        true,
        /.*/,
      ],
      ['exact no-findings sentinel row', SENTINEL, true, /.*/],
      ['header-only audit.md (zero rows)', AUDIT_SEPARATOR, false, /no rows/],
      ['none disposition', findingRow('none'), false, /invalid disposition/],
      [
        'invalid disposition',
        findingRow('wontfix'),
        false,
        /invalid disposition/,
      ],
      ['empty disposition', findingRow(''), false, /invalid disposition/],
      [
        'near-miss sentinel row',
        '| none | none | none |  no findings | none |',
        false,
        /invalid disposition/,
      ],
    ]
    for (const [label, rows, shouldPass, detailRe] of cases) {
      const report = f.run({
        auditText: [AUDIT_HEADER, AUDIT_SEPARATOR, rows].join('\n'),
      })
      if (shouldPass) {
        assert.equal(
          report.results.find(r => r.id === 'audit-findings')?.ok,
          true,
          label
        )
      } else {
        assertFails(report, 'audit-findings', detailRe, `(${label})`)
      }
    }
  })

  it('fails when the findings-table header is missing', () => {
    assertFails(
      f.run({ auditText: '# no table here\n\nsome prose\n' }),
      'audit-findings',
      /header not found/
    )
  })

  it('reports every simultaneous failure, not just the first (assert-all)', () => {
    const report = f.run({
      manifest: { ...VALID_MANIFEST, canary: 'fail', base: 'feature/branch' },
      auditText: '# no table',
      inputs: { expectedSurfaces: ['admin::Billing'] },
    })
    assert.equal(report.ok, false)
    assert.deepEqual(
      report.results.filter(r => !r.ok).map(r => r.id),
      ['canary', 'freshness', 'surface-coverage', 'audit-findings']
    )
    // passing assertions still present alongside the failures
    assert.ok(ids(report).includes('manifest-parses'))
    assert.ok(ids(report).includes('screenshots'))
  })
})
