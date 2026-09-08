import assert from 'node:assert/strict'
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'

import {
  assertAuditArtifacts,
  type AssertInputs,
  type AssertReport,
} from './assert-audit-artifacts.ts'

// Review-fix hardening suite (REP-1653 non-blocker sweep): regression tests
// for the detail-message distinctions, canonical screenshot containment, and
// the findings-table boundary. Kept in its own file so the core suite stays
// under the test-file-size gate; mirrors its fixture.

const GENERATED_AT = '2026-09-02T12:00:00.000Z'
const COMMIT_TIME_MS = Date.parse('2026-09-02T11:00:00.000Z') // 1h older
const SHOT_DIR = 'tmp/ui-verification/REP-0000/shots'
const SHOT_REL = `${SHOT_DIR}/sessions-idle.png`
const AUDIT_HEADER =
  '| pillar | severity | evidence screenshot | description | disposition |'
const AUDIT_SEPARATOR = '| --- | --- | --- | --- | --- |'

const VALID_MANIFEST = {
  issue: 'REP-0000',
  generatedAt: GENERATED_AT,
  base: 'origin/main',
  surfaces: [
    {
      surface: 'workspace::Sessions',
      states: [{ state: 'idle', screenshot: SHOT_REL }],
    },
  ],
}

const VALID_AUDIT = [
  AUDIT_HEADER,
  AUDIT_SEPARATOR,
  `| layout | P1 | ${SHOT_REL} | overlap | fixed abc1234 |`,
].join('\n')

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'assert-audit-hard-'))
  const auditDir = path.join(root, 'tmp', 'ui-verification', 'REP-0000')
  mkdirSync(path.join(root, SHOT_DIR), { recursive: true })
  writeFileSync(path.join(root, SHOT_REL), 'png-bytes')
  // Containment-hardening fixtures: a symlink pointing OUTSIDE the worktree
  // root (target: the always-existing OS tmpdir) and a directory
  // masquerading as a screenshot.
  symlinkSync(tmpdir(), path.join(root, SHOT_DIR, 'link-out.png'))
  mkdirSync(path.join(root, SHOT_DIR, 'dir.png'))

  return {
    root,
    auditDir,
    run(overrides?: {
      manifest?: unknown
      auditText?: string
      inputs?: Partial<AssertInputs>
    }): AssertReport {
      writeFileSync(
        path.join(auditDir, 'manifest.json'),
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

/** Assert one named assertion failed with a matching detail. */
function assertFails(
  report: AssertReport,
  id: string,
  detailRe: RegExp,
  message?: string
) {
  const failed = report.results.find(r => r.id === id)
  assert.equal(failed?.ok, false, `expected ${id} to fail ${message ?? ''}`)
  assert.match(failed?.detail ?? '', detailRe, `${id} detail ${message ?? ''}`)
}

describe('REP-1653 hardening: screenshot containment', () => {
  let f: ReturnType<typeof fixture>

  beforeEach(() => {
    f = fixture()
  })
  afterEach(() => rmSync(f.root, { recursive: true, force: true }))

  it('distinguishes a path resolving to the worktree root itself from an escape', () => {
    assertFails(
      f.run({
        manifest: {
          ...VALID_MANIFEST,
          surfaces: [
            {
              surface: 'workspace::Sessions',
              states: [{ state: 'r', screenshot: '.' }],
            },
          ],
        },
      }),
      'screenshots',
      /resolves to the worktree root itself, not a file/
    )
  })

  it('fails a symlink pointing outside the worktree root (canonical containment)', () => {
    assertFails(
      f.run({
        manifest: {
          ...VALID_MANIFEST,
          surfaces: [
            {
              surface: 'workspace::Sessions',
              states: [{ state: 'l', screenshot: `${SHOT_DIR}/link-out.png` }],
            },
          ],
        },
      }),
      'screenshots',
      /escapes the worktree root/
    )
  })

  it('fails a directory screenshot (must be a regular file, not just size > 0)', () => {
    assertFails(
      f.run({
        manifest: {
          ...VALID_MANIFEST,
          surfaces: [
            {
              surface: 'workspace::Sessions',
              states: [{ state: 'd', screenshot: `${SHOT_DIR}/dir.png` }],
            },
          ],
        },
      }),
      'screenshots',
      /is not a regular file/
    )
  })
})

describe('REP-1653 hardening: details, coverage, table boundary', () => {
  let f: ReturnType<typeof fixture>

  beforeEach(() => {
    f = fixture()
  })
  afterEach(() => rmSync(f.root, { recursive: true, force: true }))

  it('distinguishes a non-array surfaces field from a genuinely empty one', () => {
    for (const [surfaces, type] of [
      ['nope', 'string'],
      [7, 'number'],
      [null, 'null'],
    ] as const) {
      assertFails(
        f.run({ manifest: { ...VALID_MANIFEST, surfaces } }),
        'manifest-nonempty',
        new RegExp(`surfaces is not an array \\(${type}\\)`),
        `(surfaces ${String(surfaces)})`
      )
    }
    // The genuinely-empty case keeps its own detail.
    assertFails(
      f.run({ manifest: { ...VALID_MANIFEST, surfaces: [] } }),
      'manifest-nonempty',
      /surfaces array is empty/
    )
  })

  it('labels unnamed surfaces so a blank surface name cannot satisfy them', () => {
    // Defense-in-depth: an unnamed manifest surface records as
    // `<unnamed surface>`, never as the empty string a (now-rejected) blank
    // --surface flag would produce.
    const report = f.run({
      manifest: {
        ...VALID_MANIFEST,
        surfaces: [{ states: [{ state: 'idle', screenshot: SHOT_REL }] }],
      },
      inputs: { expectedSurfaces: [''] },
    })
    assertFails(report, 'surface-coverage', /missing from manifest surfaces/)
  })

  it('stops at the findings-table boundary — a later table is not findings', () => {
    const report = f.run({
      auditText: [
        AUDIT_HEADER,
        AUDIT_SEPARATOR,
        `| layout | P1 | ${SHOT_REL} | overlap | fixed abc1234 |`,
        '',
        '## Known artifacts',
        '',
        '| artifact | note |',
        '| --- | --- |',
        '| manifest.json | none |',
      ].join('\n'),
    })
    const findings = report.results.find(r => r.id === 'audit-findings')
    assert.equal(findings?.ok, true, findings?.detail)
  })
})
