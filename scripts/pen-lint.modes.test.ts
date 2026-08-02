import assert from 'node:assert/strict'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'

import { runApply, runCheck, runDryRun } from './pen-lint.ts'

const frame = (
  id: string,
  name: string,
  extra: Record<string, unknown> = {}
) => ({ type: 'frame', id, name, ...extra })

function fixturePenJson(
  masters: Array<[string, string]>
): Record<string, unknown> {
  return {
    version: '2.14',
    children: [
      ...masters.map(([id, name]) =>
        frame(id, name, { reusable: true, height: 36, fill: '$color-info' })
      ),
      frame('s1', 'Screen: Demo', { width: 400, height: 300, children: [] }),
    ],
    variables: { 'color-info': { type: 'color', value: [] } },
  }
}

function writePen(dir: string, pen: Record<string, unknown>): string {
  const penFile = path.join(dir, 'fixture.pen')
  writeFileSync(penFile, JSON.stringify(pen, null, 2))
  return penFile
}

function readPen(penFile: string): {
  children: Array<{
    id: string
    name: string
    reusable?: boolean
    metadata?: Record<string, string>
  }>
} {
  return JSON.parse(readFileSync(penFile, 'utf8')) as {
    children: Array<{
      id: string
      name: string
      reusable?: boolean
      metadata?: Record<string, string>
    }>
  }
}

const masterOf = (
  saved: ReturnType<typeof readPen>,
  id: string
): {
  id: string
  name: string
  metadata?: Record<string, string>
} => saved.children.find(c => c.id === id)!

describe('REP-1618 pen-lint check mode end-to-end', () => {
  it('exits non-zero with did-you-mean recommendations, zero when clean', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'pen-lint-check-'))
    try {
      const penFile = writePen(dir, fixturePenJson([['m1', 'Button']]))
      const catalogOutput = path.join(dir, 'catalog.json')
      const logs: string[] = []

      const checkCode = runCheck({
        penFile,
        catalogOutput,
        log: msg => logs.push(msg),
      })
      assert.notEqual(checkCode, 0, 'unprefixed master must fail check')
      assert.ok(
        logs.some(
          l => l.includes('did you mean') && l.includes('design::Button')
        ),
        'expected did-you-mean recommendation'
      )
      assert.ok(
        existsSync(catalogOutput),
        'check mode must write the catalog artifact'
      )
      const catalog = JSON.parse(readFileSync(catalogOutput, 'utf8')) as {
        masters: unknown[]
        screens: unknown[]
        screensIndex: Record<string, string>
        variables: Record<string, unknown>
      }
      assert.equal(catalog.masters.length, 1)
      assert.equal(catalog.screens.length, 1)
      assert.deepEqual(catalog.screensIndex, { Demo: 's1' })
      assert.ok(catalog.variables['color-info'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('flags no-exact-candidate masters with real closest matches and a human-resolution note', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'pen-lint-check-nocand-'))
    try {
      // Toast itself is now a real export (REP-1621), so a PascalCase
      // non-exported name keeps the no-candidate branch reachable while the
      // case-insensitive tier still surfaces design::Toast as closest.
      const penFile = writePen(dir, fixturePenJson([['m1', 'ToastNotReal']]))
      const logs: string[] = []
      const code = runCheck({
        penFile,
        catalogOutput: path.join(dir, 'catalog.json'),
        log: msg => logs.push(msg),
      })
      assert.notEqual(code, 0)
      const violation = logs.find(l => l.startsWith('violation:'))!
      assert.ok(violation.includes('ToastNotReal'))
      assert.ok(violation.includes('closest matches'), violation)
      assert.ok(violation.includes('design::Toast'), violation)
      assert.ok(violation.includes('Flag for human resolution'), violation)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('flags multi-candidate masters with a did-you-mean-one-of message', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'pen-lint-check-multi-'))
    try {
      const penFile = writePen(dir, fixturePenJson([['m1', 'EmptyState']]))
      const logs: string[] = []
      const code = runCheck({
        penFile,
        catalogOutput: path.join(dir, 'catalog.json'),
        log: msg => logs.push(msg),
      })
      assert.equal(code, 1, 'multi-candidate master must fail check')
      const violation = logs.find(l => l.startsWith('violation:'))!
      assert.ok(violation.includes('EmptyState'))
      assert.ok(violation.includes('multiple candidate packages'), violation)
      assert.ok(violation.includes('agentic-ui::EmptyState'), violation)
      assert.ok(violation.includes('design::EmptyState'), violation)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('rejects pattern-valid masters whose export does not exist', async () => {
    // The strict MASTER_NAME_PATTERN accepts PascalCase names like
    // design::Toastt; the "not exported" branch (!ex.has(comp)) is the
    // enforcement point and must fire in every mode.
    const dir = mkdtempSync(path.join(tmpdir(), 'pen-lint-validnoexport-'))
    try {
      const penFile = writePen(dir, fixturePenJson([['m1', 'design::Toastt']]))
      const logs: string[] = []

      const checkCode = runCheck({
        penFile,
        catalogOutput: path.join(dir, 'catalog.json'),
        log: msg => logs.push(msg),
      })
      assert.notEqual(checkCode, 0, 'missing export must fail check')
      const violation = logs.find(l => l.startsWith('violation:'))!
      assert.ok(violation.includes('Toastt'), violation)
      assert.ok(
        violation.includes('not exported from @repro/design'),
        violation
      )

      const jsonOuts: string[] = []
      const dryRunCode = runDryRun({
        penFile,
        jsonOut: json => jsonOuts.push(json),
        log: () => {},
      })
      assert.equal(dryRunCode, 1, 'missing export must fail dry-run')
      const report = JSON.parse(jsonOuts.join('\n')) as {
        resolved: number
        unresolved: number
        masters: Array<{
          masterId: string
          status: string
          reason?: string
        }>
      }
      assert.equal(report.resolved, 0)
      assert.equal(report.unresolved, 1)
      assert.equal(report.masters[0]!.status, 'violation')

      const applyLogs: string[] = []
      const applyCode = await runApply({
        penFile,
        log: msg => applyLogs.push(msg),
      })
      assert.equal(applyCode, 1, 'missing export must fail apply')
      assert.equal(masterOf(readPen(penFile), 'm1').name, 'design::Toastt')
      assert.ok(
        applyLogs.some(l => l.includes('not exported from @repro/design')),
        applyLogs.join('\n')
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('REP-1618 pen-lint dry-run mode', () => {
  it('emits machine JSON to stdout and never writes the pen file', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'pen-lint-dryrun-'))
    try {
      const penFile = writePen(
        dir,
        fixturePenJson([
          ['m1', 'Button'],
          ['m2', 'Badge'],
        ])
      )
      const before = readFileSync(penFile, 'utf8')
      const jsonOuts: string[] = []
      const logs: string[] = []

      const code = runDryRun({
        penFile,
        jsonOut: json => jsonOuts.push(json),
        log: msg => logs.push(msg),
      })
      assert.equal(code, 0, 'all fixture masters are auto-resolvable')
      assert.equal(
        readFileSync(penFile, 'utf8'),
        before,
        'dry-run must not write the pen file'
      )
      const report = JSON.parse(jsonOuts.join('\n')) as {
        mode: string
        clean: boolean
        resolved: number
        unresolved: number
        masters: Array<{
          masterId: string
          masterName: string
          status: string
          proposedName?: string
          candidates?: Array<{ package: string; component: string }>
        }>
      }
      assert.equal(report.mode, 'dry-run')
      assert.equal(report.clean, true)
      assert.equal(report.resolved, 2)
      assert.equal(report.unresolved, 0)
      const button = report.masters.find(m => m.masterId === 'm1')!
      assert.equal(button.status, 'auto')
      assert.equal(button.proposedName, 'design::Button')
      assert.deepEqual(button.candidates, [
        { package: 'design', component: 'Button', confidence: 'exact' },
      ])
      assert.ok(
        logs.some(l => l.includes('2 master(s) resolvable')),
        'human summary goes to stderr log'
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('exits non-zero when any master is unresolvable (no-candidate)', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'pen-lint-dryrun-unres-'))
    try {
      const penFile = writePen(
        dir,
        fixturePenJson([
          ['m1', 'Button'],
          ['m2', 'ToastNotReal'],
        ])
      )
      const jsonOuts: string[] = []
      const code = runDryRun({
        penFile,
        jsonOut: json => jsonOuts.push(json),
        log: () => {},
      })
      assert.equal(code, 1, 'no-candidate master must make dry-run exit 1')
      const report = JSON.parse(jsonOuts.join('\n')) as {
        resolved: number
        unresolved: number
        masters: Array<{
          masterId: string
          status: string
          closestMatches?: unknown[]
        }>
      }
      assert.equal(report.resolved, 1)
      assert.equal(report.unresolved, 1)
      const noCandidate = report.masters.find(m => m.masterId === 'm2')!
      assert.equal(noCandidate.status, 'no-candidate')
      assert.ok(Array.isArray(noCandidate.closestMatches))
      assert.ok(
        noCandidate.closestMatches!.length > 0,
        'closest matches must not be empty for a no-candidate master'
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('REP-1618 pen-lint apply mode end-to-end', () => {
  it('auto-renames single-candidate masters, writes metadata, and is idempotent', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'pen-lint-apply-'))
    try {
      const penFile = writePen(
        dir,
        fixturePenJson([
          ['m1', 'Button'],
          ['m2', 'Badge'],
        ])
      )
      const logs: string[] = []

      const applyCode = await runApply({ penFile, log: msg => logs.push(msg) })
      assert.equal(applyCode, 0, logs.join('\n'))

      const saved = readPen(penFile)
      assert.equal(masterOf(saved, 'm1').name, 'design::Button')
      assert.equal(masterOf(saved, 'm2').name, 'design::Badge')
      assert.deepEqual(masterOf(saved, 'm1').metadata, {
        type: 'master',
        package: 'design',
        component: 'Button',
      })
      assert.deepEqual(masterOf(saved, 'm2').metadata, {
        type: 'master',
        package: 'design',
        component: 'Badge',
      })
      // Screen frames are untouched by apply
      assert.equal(
        saved.children.find(c => c.id === 's1')!.name,
        'Screen: Demo'
      )

      // Idempotent: second apply is a no-op and check now passes
      const applyAgain = await runApply({ penFile, log: () => {} })
      assert.equal(applyAgain, 0)
      const code = runCheck({
        penFile,
        catalogOutput: path.join(dir, 'catalog2.json'),
        log: () => {},
      })
      assert.equal(code, 0, 'check must pass after apply')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('ambiguous master in non-TTY emits JSON and exits non-zero', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'pen-lint-apply-ambig-'))
    try {
      const penFile = writePen(dir, fixturePenJson([['m1', 'EmptyState']]))
      const before = readFileSync(penFile, 'utf8')
      const jsonOuts: string[] = []
      const logs: string[] = []

      const code = await runApply({
        penFile,
        tty: false,
        jsonOut: json => jsonOuts.push(json),
        log: msg => logs.push(msg),
      })
      assert.equal(code, 1, 'ambiguous master must exit non-zero in non-TTY')
      assert.equal(
        readFileSync(penFile, 'utf8'),
        before,
        'non-TTY apply must not rename an ambiguous master'
      )
      const emitted = JSON.parse(jsonOuts.join('\n')) as {
        mode: string
        masters: Array<{ masterId: string; candidates: unknown[] }>
      }
      assert.equal(emitted.mode, 'apply')
      assert.equal(emitted.masters[0]!.masterId, 'm1')
      assert.equal(emitted.masters[0]!.candidates.length, 2)
      assert.ok(
        logs.some(l => l.includes('--select')),
        'non-TTY logs must suggest --select'
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('ambiguous master resolves via the injected prompt in TTY mode', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'pen-lint-apply-prompt-'))
    try {
      const penFile = writePen(dir, fixturePenJson([['m1', 'EmptyState']]))
      const code = await runApply({
        penFile,
        tty: true,
        prompt: async () => 1, // design::EmptyState (agentic-ui sorts first)
        log: () => {},
      })
      assert.equal(code, 0)
      assert.equal(masterOf(readPen(penFile), 'm1').name, 'design::EmptyState')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('apply summary counts prompt-resolved masters as accepted, not ambiguous', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'pen-lint-apply-promptsum-'))
    try {
      const penFile = writePen(dir, fixturePenJson([['m1', 'EmptyState']]))
      const logs: string[] = []
      const code = await runApply({
        penFile,
        tty: true,
        prompt: async () => 1, // design::EmptyState (agentic-ui sorts first)
        log: msg => logs.push(msg),
      })
      assert.equal(code, 0, logs.join('\n'))
      assert.equal(masterOf(readPen(penFile), 'm1').name, 'design::EmptyState')
      const summary = logs.find(l => l.startsWith('apply summary:'))!
      assert.match(
        summary,
        /1 accepted, 0 skipped, 0 ambiguous, 0 unresolved/,
        summary
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('applies --select resolutions verbatim', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'pen-lint-apply-select-'))
    try {
      const penFile = writePen(
        dir,
        fixturePenJson([
          ['m1', 'Button'],
          ['m2', 'Badge'],
        ])
      )
      const code = await runApply({
        penFile,
        select: { m1: 'design::Card' },
        log: () => {},
      })
      assert.equal(code, 0)
      assert.equal(masterOf(readPen(penFile), 'm1').name, 'design::Card')
      assert.equal(masterOf(readPen(penFile), 'm2').name, 'design::Badge')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('rejects invalid --select entries as unresolved', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'pen-lint-apply-selectbad-'))
    try {
      const penFile = writePen(dir, fixturePenJson([['m1', 'Button']]))
      const logs: string[] = []
      const code = await runApply({
        penFile,
        select: { m1: 'design::NotARealExport' },
        log: msg => logs.push(msg),
      })
      assert.equal(code, 1)
      assert.ok(logs.some(l => l.includes('NotARealExport')))
      assert.equal(masterOf(readPen(penFile), 'm1').name, 'Button')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('skips zero-candidate masters, reports them, and continues', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'pen-lint-apply-skip-'))
    try {
      const penFile = writePen(
        dir,
        fixturePenJson([
          ['m1', 'NoSuchExport'],
          ['m2', 'Badge'],
        ])
      )
      const logs: string[] = []
      const code = await runApply({ penFile, log: msg => logs.push(msg) })
      assert.equal(code, 1, 'skipped master must exit non-zero')
      assert.equal(masterOf(readPen(penFile), 'm2').name, 'design::Badge')
      assert.equal(masterOf(readPen(penFile), 'm1').name, 'NoSuchExport')
      assert.ok(
        logs.some(l => l.includes('NoSuchExport')),
        logs.join('\n')
      )
      assert.ok(
        logs.some(l => l.includes('Flag for human resolution')),
        logs.join('\n')
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
