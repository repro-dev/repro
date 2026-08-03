import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'

import type { PenFile } from './pen-lint.ts'
import { parsePenJson, runApply } from './pen-lint.ts'

const frame = (
  id: string,
  name: string,
  extra: Record<string, unknown> = {}
) => ({ type: 'frame', id, name, ...extra })

/** Masters grouped under masters/<pkg>/; ungrouped masters stay at top level. */
function applyFixture(
  masters: Array<{ id: string; name: string; group?: string }>
): PenFile {
  const designChildren: unknown[] = []
  const topChildren: unknown[] = []
  const screensChildren: unknown[] = []
  for (const master of masters) {
    const node = frame(master.id, master.name, {
      reusable: true,
      height: 36,
      fill: '$color-info',
    })
    if (master.group === 'design') designChildren.push(node)
    else if (master.group === 'screens') screensChildren.push(node)
    else topChildren.push(node)
  }
  const children: unknown[] = []
  if (designChildren.length > 0 || topChildren.length > 0) {
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
  if (screensChildren.length > 0) {
    children.push({
      type: 'group',
      id: 'gS',
      name: 'screens',
      children: [
        { type: 'group', id: 'gDemo', name: 'demo', children: screensChildren },
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

interface SavedNode {
  id: string
  name: string
  reusable?: boolean
  metadata?: Record<string, string>
}

function readPen(penFile: string): PenFile {
  return parsePenJson(readFileSync(penFile, 'utf8'))
}

function findNode(pen: PenFile, id: string): SavedNode | null {
  const stack = [...pen.children]
  while (stack.length > 0) {
    const node = stack.pop()!
    if (node.id === id) return node as SavedNode
    if (Array.isArray(node.children)) stack.push(...node.children)
  }
  return null
}

describe('REP-1622 pen-lint apply mode (repair)', () => {
  it('moves an ungrouped master into masters/<pkg>/ and writes metadata', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'pen-lint-apply-repair-'))
    try {
      const penFile = writePen(
        dir,
        applyFixture([
          { id: 'm1', name: 'Button' },
          { id: 'm2', name: 'Badge' },
        ])
      )
      const logs: string[] = []
      const code = await runApply({ penFile, log: msg => logs.push(msg) })
      assert.equal(code, 0, logs.join('\n'))

      const saved = readPen(penFile)
      const mastersGroup = saved.children.find(
        c => c.type === 'group' && c.name === 'masters'
      )!
      const designGroup = mastersGroup.children!.find(c => c.name === 'design')!
      assert.deepEqual(designGroup.children!.map(c => c.id).sort(), [
        'm1',
        'm2',
      ])
      const button = findNode(saved, 'm1')!
      assert.deepEqual(button.metadata, {
        type: 'master',
        package: 'design',
        component: 'Button',
      })
      // Names are labels now — apply never renames.
      assert.equal(button.name, 'Button')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('is idempotent: a second apply is a no-op', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'pen-lint-apply-idem-'))
    try {
      const penFile = writePen(
        dir,
        applyFixture([
          { id: 'm1', name: 'Button' },
          { id: 'm2', name: 'Badge' },
        ])
      )
      const first = await runApply({ penFile, log: () => {} })
      assert.equal(first, 0)
      const afterFirst = readFileSync(penFile, 'utf8')
      const second = await runApply({ penFile, log: () => {} })
      assert.equal(second, 0)
      assert.equal(readFileSync(penFile, 'utf8'), afterFirst)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('moves a master out of a screens group into masters/<pkg>/', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'pen-lint-apply-fromscreen-'))
    try {
      const penFile = writePen(
        dir,
        applyFixture([{ id: 'm1', name: 'Button', group: 'screens' }])
      )
      const code = await runApply({ penFile, log: () => {} })
      assert.equal(code, 0)
      const saved = readPen(penFile)
      const designGroup = saved.children
        .find(c => c.name === 'masters')!
        .children!.find(c => c.name === 'design')!
      assert.deepEqual(
        designGroup.children!.map(c => c.id),
        ['m1']
      )
      const screensGroup = saved.children.find(c => c.name === 'screens')!
      assert.equal(screensGroup.children![0]!.children!.length, 0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('ambiguous master in non-TTY emits JSON and exits non-zero', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'pen-lint-apply-ambig-'))
    try {
      const penFile = writePen(
        dir,
        applyFixture([{ id: 'm1', name: 'EmptyState' }])
      )
      const before = readFileSync(penFile, 'utf8')
      const jsonOuts: string[] = []
      const code = await runApply({
        penFile,
        tty: false,
        jsonOut: json => jsonOuts.push(json),
        log: () => {},
      })
      assert.equal(code, 1)
      assert.equal(readFileSync(penFile, 'utf8'), before)
      const emitted = JSON.parse(jsonOuts.join('\n')) as {
        mode: string
        masters: Array<{ masterId: string; candidates: unknown[] }>
      }
      assert.equal(emitted.mode, 'apply')
      assert.equal(emitted.masters[0]!.candidates.length, 2)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('ambiguous master resolves via the injected prompt in TTY mode', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'pen-lint-apply-prompt-'))
    try {
      const penFile = writePen(
        dir,
        applyFixture([{ id: 'm1', name: 'EmptyState' }])
      )
      const code = await runApply({
        penFile,
        tty: true,
        prompt: async () => 1, // design::EmptyState (agentic-ui sorts first)
        log: () => {},
      })
      assert.equal(code, 0)
      const saved = readPen(penFile)
      const designGroup = saved.children
        .find(c => c.name === 'masters')!
        .children!.find(c => c.name === 'design')!
      assert.deepEqual(
        designGroup.children!.map(c => c.id),
        ['m1']
      )
      assert.equal(findNode(saved, 'm1')!.metadata!.component, 'EmptyState')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('applies --select resolutions verbatim (move + metadata)', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'pen-lint-apply-select-'))
    try {
      const penFile = writePen(
        dir,
        applyFixture([
          { id: 'm1', name: 'Button' },
          { id: 'm2', name: 'Badge' },
        ])
      )
      const code = await runApply({
        penFile,
        select: { m1: 'design::Card' },
        log: () => {},
      })
      assert.equal(code, 0)
      const saved = readPen(penFile)
      assert.equal(findNode(saved, 'm1')!.metadata!.component, 'Card')
      assert.equal(findNode(saved, 'm2')!.metadata!.component, 'Badge')
      // Both land in the same masters/design group.
      const designGroup = saved.children
        .find(c => c.name === 'masters')!
        .children!.find(c => c.name === 'design')!
      assert.deepEqual(designGroup.children!.map(c => c.id).sort(), [
        'm1',
        'm2',
      ])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('rejects invalid --select entries as unresolved', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'pen-lint-apply-selectbad-'))
    try {
      const penFile = writePen(
        dir,
        applyFixture([{ id: 'm1', name: 'Button' }])
      )
      const logs: string[] = []
      const code = await runApply({
        penFile,
        select: { m1: 'design::NotARealExport' },
        log: msg => logs.push(msg),
      })
      assert.equal(code, 1)
      assert.ok(logs.some(l => l.includes('NotARealExport')))
      // Nothing moved, no metadata written.
      const saved = readPen(penFile)
      assert.equal(findNode(saved, 'm1')!.metadata, undefined)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('skips zero-candidate masters, reports them, and continues', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'pen-lint-apply-skip-'))
    try {
      const penFile = writePen(
        dir,
        applyFixture([
          { id: 'm1', name: 'NoSuchExport' },
          { id: 'm2', name: 'Badge' },
        ])
      )
      const logs: string[] = []
      const code = await runApply({ penFile, log: msg => logs.push(msg) })
      assert.equal(code, 1, 'skipped master must exit non-zero')
      const saved = readPen(penFile)
      // Badge was repaired; NoSuchExport stayed put.
      assert.equal(findNode(saved, 'm2')!.metadata!.component, 'Badge')
      assert.equal(findNode(saved, 'm1')!.metadata, undefined)
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

  it('keeps conforming masters in place and writes their metadata', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'pen-lint-apply-conform-'))
    try {
      const penFile = writePen(
        dir,
        applyFixture([{ id: 'm1', name: 'Button', group: 'design' }])
      )
      const logs: string[] = []
      const code = await runApply({ penFile, log: msg => logs.push(msg) })
      assert.equal(code, 0, logs.join('\n'))
      const saved = readPen(penFile)
      // Still in masters/design (no move), metadata repaired.
      const designGroup = saved.children
        .find(c => c.name === 'masters')!
        .children!.find(c => c.name === 'design')!
      assert.deepEqual(
        designGroup.children!.map(c => c.id),
        ['m1']
      )
      assert.deepEqual(findNode(saved, 'm1')!.metadata, {
        type: 'master',
        package: 'design',
        component: 'Button',
      })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
