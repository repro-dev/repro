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
const AUDIT_DIR = 'tmp/ui-verification/REP-0000/candidate-abc1234-attempt-1'
const SHOT_DIR = `${AUDIT_DIR}/shots`
const SHOT_REL = `${SHOT_DIR}/sessions-idle.png`
const PRIOR_SHOT_REL = 'tmp/ui-verification/REP-0000/shots/sessions-idle.png'
const AUDIT_HEADER =
  '| pillar | severity | evidence screenshot | description | disposition |'
const AUDIT_SEPARATOR = '| --- | --- | --- | --- | --- |'

const VALID_MANIFEST = {
  issue: 'REP-0000',
  generatedAt: GENERATED_AT,
  base: 'origin/main',
  auditCheckpointCommit: 'abc1234',
  surfaces: [
    {
      surface: 'workspace::Sessions',
      auditedAtCommit: 'abc1234',
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
  const auditDir = path.join(root, AUDIT_DIR)
  mkdirSync(path.join(root, SHOT_DIR), { recursive: true })
  writeFileSync(path.join(root, SHOT_REL), 'png-bytes')
  mkdirSync(path.dirname(path.join(root, PRIOR_SHOT_REL)), { recursive: true })
  writeFileSync(path.join(root, PRIOR_SHOT_REL), 'prior-png-bytes')
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
        checkpointCommit: 'abc1234',
        commitTimeMs: COMMIT_TIME_MS,
        worktreeRoot: root,
        auditDir,
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

  it('rejects a prior-bundle screenshot even when the changed surface is current', () => {
    const report = f.run({
      manifest: {
        ...VALID_MANIFEST,
        surfaces: [
          {
            ...VALID_MANIFEST.surfaces[0],
            auditedAtCommit: 'abc1234',
            states: [{ state: 'idle', screenshot: PRIOR_SHOT_REL }],
          },
        ],
      },
    })
    assertFails(report, 'screenshots', /outside the candidate audit directory/)
  })

  it('rejects a candidate audit directory that aliases the prior canonical bundle', () => {
    rmSync(f.auditDir, { recursive: true, force: true })
    symlinkSync(path.join(f.root, 'tmp/ui-verification/REP-0000'), f.auditDir)

    const report = f.run({
      manifest: {
        ...VALID_MANIFEST,
        surfaces: [
          {
            ...VALID_MANIFEST.surfaces[0],
            states: [
              {
                state: 'idle',
                screenshot: `${AUDIT_DIR}/shots/sessions-idle.png`,
              },
            ],
          },
        ],
      },
    })

    assert.equal(
      report.results.find(result => result.id === 'screenshots')?.ok,
      true,
      'the changed screenshot is lexically beneath the candidate alias'
    )
    assert.deepEqual(
      report.results.filter(result => !result.ok).map(result => result.id),
      ['candidate-audit-directory']
    )
    assertFails(report, 'candidate-audit-directory', /canonical|candidate/i)
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

  it('fails closed when the manifest checkpoint is missing or does not match the asserted commit', () => {
    const missing = f.run({
      manifest: { ...VALID_MANIFEST, auditCheckpointCommit: undefined },
    })
    assertFails(missing, 'audit-checkpoint', /missing|does not match/i)

    const stale = f.run({
      manifest: { ...VALID_MANIFEST, auditCheckpointCommit: 'older123' },
    })
    assertFails(
      stale,
      'audit-checkpoint',
      /older123.*abc1234|abc1234.*older123/i
    )
  })

  it('requires changed surfaces to be audited at the asserted checkpoint but permits older unchanged evidence', () => {
    const staleChanged = f.run({
      manifest: {
        ...VALID_MANIFEST,
        surfaces: [
          {
            ...VALID_MANIFEST.surfaces[0],
            auditedAtCommit: 'older123',
          },
          {
            surface: 'workspace::History',
            auditedAtCommit: 'prior456',
            states: [{ state: 'idle', screenshot: PRIOR_SHOT_REL }],
          },
        ],
      },
    })
    assertFails(
      staleChanged,
      'surface-checkpoints',
      /workspace::Sessions.*older123.*abc1234/
    )

    const reusedUnchanged = f.run({
      manifest: {
        ...VALID_MANIFEST,
        surfaces: [
          VALID_MANIFEST.surfaces[0],
          {
            surface: 'workspace::History',
            auditedAtCommit: 'prior456',
            states: [{ state: 'idle', screenshot: PRIOR_SHOT_REL }],
          },
        ],
      },
    })
    assert.equal(reusedUnchanged.ok, true)
  })

  it('fails closed when any surface omits audit checkpoint provenance', () => {
    const report = f.run({
      manifest: {
        ...VALID_MANIFEST,
        surfaces: [
          VALID_MANIFEST.surfaces[0],
          {
            surface: 'workspace::History',
            states: [{ state: 'idle', screenshot: SHOT_REL }],
          },
        ],
      },
    })
    assertFails(
      report,
      'surface-checkpoints',
      /History.*auditedAtCommit.*missing/i
    )
  })
})
