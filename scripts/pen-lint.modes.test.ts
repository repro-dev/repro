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

import type { PenFile } from './pen-lint.ts'
import { parsePenJson, runCheck, runDryRun } from './pen-lint.ts'

const frame = (
  id: string,
  name: string,
  extra: Record<string, unknown> = {}
) => ({ type: 'frame', id, name, ...extra })

function groupedPen(
  masters: Array<{ id: string; name: string; group?: string }>,
  screens: Array<{ id: string; name: string }> = []
): PenFile {
  const byGroup = new Map<string, unknown[]>()
  for (const master of masters) {
    const key = master.group ?? 'top'
    const list = byGroup.get(key) ?? []
    list.push(
      frame(master.id, master.name, {
        reusable: true,
        height: 36,
        fill: '$color-info',
      })
    )
    byGroup.set(key, list)
  }
  const children: unknown[] = []
  if (byGroup.has('design') || byGroup.has('top')) {
    const designChildren = byGroup.get('design') ?? []
    const topChildren = byGroup.get('top') ?? []
    children.push({
      type: 'group',
      id: 'gM',
      name: 'masters',
      children: [
        ...(designChildren.length > 0
          ? [
              {
                type: 'group',
                id: 'gD',
                name: 'design',
                children: designChildren,
              },
            ]
          : []),
        ...topChildren,
      ],
    })
  }
  if (screens.length > 0 || byGroup.has('screens')) {
    children.push({
      type: 'group',
      id: 'gS',
      name: 'screens',
      children: [
        {
          type: 'group',
          id: 'gDemo',
          name: 'demo',
          children: [
            {
              type: 'group',
              id: 'gF',
              name: 'demo-family',
              children: [
                ...screens.map(s =>
                  frame(s.id, s.name, {
                    width: 400,
                    height: 300,
                    children: [],
                  })
                ),
                ...(byGroup.get('screens') ?? []),
              ],
            },
          ],
        },
      ],
    })
  }
  return parsePenJson(
    JSON.stringify({
      version: '2.14',
      children,
      variables: { 'color-info': { type: 'color', value: [] } },
    })
  )
}

function writePen(dir: string, pen: PenFile): string {
  const penFile = path.join(dir, 'fixture.pen')
  writeFileSync(penFile, JSON.stringify(pen, null, 2))
  return penFile
}

describe('REP-1622 pen-lint check mode (grouped)', () => {
  it('passes when masters are inside masters/<pkg> groups', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'pen-lint-check-ok-'))
    try {
      const penFile = writePen(
        dir,
        groupedPen([
          { id: 'm1', name: 'Button', group: 'design' },
          { id: 'm2', name: 'Badge', group: 'design' },
        ])
      )
      const logs: string[] = []
      const code = runCheck({
        penFile,
        catalogOutput: path.join(dir, 'catalog.json'),
        log: msg => logs.push(msg),
      })
      assert.equal(code, 0, logs.join('\n'))
      assert.ok(
        logs.some(l => l.includes('pen-lint check passed')),
        logs.join('\n')
      )
      assert.equal(
        existsSync(path.join(dir, 'catalog.json')),
        true,
        'check mode must write the catalog artifact'
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('flags a top-level (ungrouped) master with a did-you-mean repair hint', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'pen-lint-check-ungrouped-'))
    try {
      const penFile = writePen(dir, groupedPen([{ id: 'm1', name: 'Button' }]))
      const logs: string[] = []
      const code = runCheck({
        penFile,
        catalogOutput: path.join(dir, 'catalog.json'),
        log: msg => logs.push(msg),
      })
      assert.equal(code, 1)
      const violation = logs.find(l => l.startsWith('violation:'))!
      assert.ok(
        violation.includes('not inside a masters/<pkg> group'),
        violation
      )
      assert.ok(violation.includes('design::Button'), violation)
      assert.ok(violation.includes('--apply'), violation)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('flags a master in the wrong package group', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'pen-lint-check-pkg-'))
    try {
      // 'ErrorMessage' is exported only from agentic-ui; a master named
      // ErrorMessage inside masters/design cannot resolve from its path.
      const penFile = writePen(
        dir,
        groupedPen([{ id: 'm1', name: 'ErrorMessage', group: 'design' }])
      )
      const logs: string[] = []
      const code = runCheck({
        penFile,
        catalogOutput: path.join(dir, 'catalog.json'),
        log: msg => logs.push(msg),
      })
      assert.equal(code, 1)
      const violation = logs.find(l => l.startsWith('violation:'))!
      assert.ok(
        violation.includes('not exported from @repro/design'),
        violation
      )
      assert.ok(violation.includes('agentic-ui::ErrorMessage'), violation)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('flags a master whose package group does not exist', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'pen-lint-check-nopkg-'))
    try {
      const pen = groupedPen([{ id: 'm1', name: 'Button', group: 'design' }])
      // Rewrite the group name to a package that does not exist.
      const raw = readFileSync(writePen(dir, pen), 'utf8').replace(
        '"name": "design"',
        '"name": "not-a-package"'
      )
      const penFile = path.join(dir, 'fixture.pen')
      writeFileSync(penFile, raw)
      const logs: string[] = []
      const code = runCheck({
        penFile,
        catalogOutput: path.join(dir, 'catalog.json'),
        log: msg => logs.push(msg),
      })
      assert.equal(code, 1)
      const violation = logs.find(l => l.startsWith('violation:'))!
      assert.ok(
        violation.includes('package "not-a-package" does not exist'),
        violation
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('flags a path-conforming master with a missing export and did-you-mean candidates', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'pen-lint-check-nocand-'))
    try {
      const penFile = writePen(
        dir,
        groupedPen([{ id: 'm1', name: 'ToastNotReal', group: 'design' }])
      )
      const logs: string[] = []
      const code = runCheck({
        penFile,
        catalogOutput: path.join(dir, 'catalog.json'),
        log: msg => logs.push(msg),
      })
      assert.equal(code, 1)
      const violation = logs.find(l => l.startsWith('violation:'))!
      assert.ok(violation.includes('ToastNotReal'), violation)
      assert.ok(
        violation.includes('not exported from @repro/design'),
        violation
      )
      assert.ok(violation.includes('did you mean'), violation)
      assert.ok(violation.includes('design::Toast'), violation)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('flags invalid state-family metadata', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'pen-lint-check-state-'))
    try {
      const pen = parsePenJson(
        JSON.stringify({
          version: '2.14',
          children: [
            {
              type: 'group',
              id: 'gS',
              name: 'screens',
              children: [
                {
                  type: 'group',
                  id: 'gDemo',
                  name: 'demo',
                  children: [
                    {
                      type: 'group',
                      id: 'gF',
                      name: 'demo-family',
                      children: [
                        frame('sBad', 'Admin: Health', {
                          children: [],
                          metadata: {
                            type: 'screen',
                            stateFamily: 'screens/admin/health',
                            state: 'bogus',
                          },
                        }),
                      ],
                    },
                  ],
                },
              ],
            },
          ],
          variables: {},
        })
      )
      const penFile = writePen(dir, pen)
      const logs: string[] = []
      const code = runCheck({
        penFile,
        catalogOutput: path.join(dir, 'catalog.json'),
        log: msg => logs.push(msg),
      })
      assert.equal(code, 1)
      assert.ok(
        logs.some(l => l.includes('invalid state "bogus"')),
        logs.join('\n')
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('REP-1622 pen-lint dry-run mode (grouped)', () => {
  it('emits machine JSON to stdout and never writes the pen file', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'pen-lint-dryrun-'))
    try {
      const penFile = writePen(
        dir,
        groupedPen([
          { id: 'm1', name: 'Button', group: 'design' },
          { id: 'm2', name: 'Badge', group: 'design' },
        ])
      )
      const before = readFileSync(penFile, 'utf8')
      const jsonOuts: string[] = []
      const code = runDryRun({
        penFile,
        jsonOut: json => jsonOuts.push(json),
        log: () => {},
      })
      assert.equal(code, 0, 'grouped fixture masters are conforming')
      assert.equal(readFileSync(penFile, 'utf8'), before)
      const report = JSON.parse(jsonOuts.join('\n')) as {
        mode: string
        clean: boolean
        resolved: number
        unresolved: number
        masters: Array<{ masterId: string; status: string }>
      }
      assert.equal(report.mode, 'dry-run')
      assert.equal(report.clean, true)
      assert.equal(report.resolved, 2)
      assert.deepEqual(
        report.masters.map(m => m.status),
        ['conforming', 'conforming']
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('reports an ungrouped master as auto-repairable (single exact candidate)', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'pen-lint-dryrun-auto-'))
    try {
      const penFile = writePen(dir, groupedPen([{ id: 'm1', name: 'Button' }]))
      const jsonOuts: string[] = []
      const code = runDryRun({
        penFile,
        jsonOut: json => jsonOuts.push(json),
        log: () => {},
      })
      assert.equal(code, 0, 'auto-repairable masters count as resolvable')
      const report = JSON.parse(jsonOuts.join('\n')) as {
        resolved: number
        unresolved: number
        masters: Array<{
          masterId: string
          status: string
          proposedName?: string
        }>
      }
      assert.equal(report.resolved, 1)
      assert.equal(report.masters[0]!.status, 'auto')
      assert.equal(report.masters[0]!.proposedName, 'design::Button')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('reports an ambiguous master and exits non-zero', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'pen-lint-dryrun-ambig-'))
    try {
      const penFile = writePen(
        dir,
        groupedPen([{ id: 'm1', name: 'EmptyState' }])
      )
      const jsonOuts: string[] = []
      const code = runDryRun({
        penFile,
        jsonOut: json => jsonOuts.push(json),
        log: () => {},
      })
      assert.equal(code, 1)
      const report = JSON.parse(jsonOuts.join('\n')) as {
        unresolved: number
        masters: Array<{
          masterId: string
          status: string
          candidates: unknown[]
        }>
      }
      assert.equal(report.unresolved, 1)
      assert.equal(report.masters[0]!.status, 'ambiguous')
      assert.equal(report.masters[0]!.candidates.length, 2)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('reports a path-conforming master with a missing export as a violation', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'pen-lint-dryrun-viol-'))
    try {
      const penFile = writePen(
        dir,
        groupedPen([{ id: 'm1', name: 'Toastt', group: 'design' }])
      )
      const jsonOuts: string[] = []
      const code = runDryRun({
        penFile,
        jsonOut: json => jsonOuts.push(json),
        log: () => {},
      })
      assert.equal(code, 1)
      const report = JSON.parse(jsonOuts.join('\n')) as {
        masters: Array<{ masterId: string; status: string; reason?: string }>
      }
      assert.equal(report.masters[0]!.status, 'violation')
      assert.match(
        report.masters[0]!.reason!,
        /not exported from @repro\/design/
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
