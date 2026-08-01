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

import { runApply, runCheck } from './pen-sync.ts'

const frame = (
  id: string,
  name: string,
  extra: Record<string, unknown> = {}
) => ({ type: 'frame', id, name, ...extra })

const entry = (masterId: string, code: string) => ({
  masterId,
  code,
  dims: {},
  variants: {},
  overrideToProps: {},
})

function fixturePenJson(): Record<string, unknown> {
  return {
    version: '2.14',
    children: [
      frame('m1', 'Button', {
        reusable: true,
        height: 36,
        fill: '$color-info',
      }),
      frame('m2', 'Badge', { reusable: true, height: 24 }),
      frame('s1', 'Screen: Demo', { width: 400, height: 300, children: [] }),
    ],
    variables: { 'color-info': { type: 'color', value: [] } },
  }
}

function fixtureComponentMapJson(): Record<string, unknown> {
  return {
    components: {
      Button: entry('m1', '@repro/design Button'),
      Badge: entry('m2', '@repro/design Badge'),
    },
    noMaster: [],
    screens: {},
  }
}

function writeFixture(
  dir: string,
  pen: Record<string, unknown>,
  componentMap: Record<string, unknown>
): { penFile: string; componentMapFile: string } {
  const penFile = path.join(dir, 'fixture.pen')
  const componentMapFile = path.join(dir, 'component-map.json')
  writeFileSync(penFile, JSON.stringify(pen, null, 2))
  writeFileSync(componentMapFile, JSON.stringify(componentMap, null, 2))
  return { penFile, componentMapFile }
}

describe('REP-1620 pen-sync check mode end-to-end', () => {
  it('exits non-zero with violations for unapplied masters, zero when clean', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'pen-sync-check-'))
    try {
      const { penFile, componentMapFile } = writeFixture(
        dir,
        fixturePenJson(),
        fixtureComponentMapJson()
      )
      const catalogOutput = path.join(dir, 'catalog.json')
      const logs: string[] = []

      const checkCode = runCheck({
        penFile,
        componentMapFile,
        catalogOutput,
        log: msg => logs.push(msg),
      })
      assert.notEqual(checkCode, 0, 'unapplied fixture must fail check')
      assert.ok(
        logs.some(l => l.includes('design::Button')),
        'expected rename violation for Button'
      )
      assert.ok(
        logs.some(l => l.includes('design::Badge')),
        'expected rename violation for Badge'
      )
      assert.ok(
        existsSync(catalogOutput),
        'check mode must write the catalog artifact'
      )
      const catalog = JSON.parse(readFileSync(catalogOutput, 'utf8')) as {
        masters: unknown[]
        screens: unknown[]
        variables: Record<string, unknown>
      }
      assert.equal(catalog.masters.length, 2)
      assert.equal(catalog.screens.length, 1)
      assert.ok(catalog.variables['color-info'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('flags masters whose code token is not exported from the package', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'pen-sync-check-export-'))
    try {
      const pen = fixturePenJson()
      const componentMap = fixtureComponentMapJson()
      ;(pen.children as Array<{ reusable?: boolean; name: string }>).forEach(
        child => {
          if (child.reusable) child.name = `design::${child.name}`
        }
      )
      ;(
        componentMap.components as Record<string, { code: string }>
      ).Button.code = '@repro/design DoesNotExistAnywhere'
      const { penFile, componentMapFile } = writeFixture(dir, pen, componentMap)
      const logs: string[] = []
      const code = runCheck({
        penFile,
        componentMapFile,
        catalogOutput: path.join(dir, 'catalog.json'),
        log: msg => logs.push(msg),
      })
      assert.notEqual(code, 0)
      assert.ok(
        logs.some(l => l.includes('DoesNotExistAnywhere')),
        'expected export violation'
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('REP-1620 pen-sync apply mode end-to-end', () => {
  it('renames masters, sets metadata, and becomes idempotent', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'pen-sync-apply-'))
    try {
      const { penFile, componentMapFile } = writeFixture(
        dir,
        fixturePenJson(),
        fixtureComponentMapJson()
      )
      const logs: string[] = []

      const applyCode = runApply({
        penFile,
        componentMapFile,
        log: msg => logs.push(msg),
      })
      assert.equal(applyCode, 0)

      const saved = JSON.parse(readFileSync(penFile, 'utf8')) as {
        children: Array<{
          id: string
          name: string
          reusable?: boolean
          metadata?: Record<string, string>
        }>
      }
      const masters = saved.children.filter(c => c.reusable)
      assert.equal(masters.find(m => m.id === 'm1')!.name, 'design::Button')
      assert.equal(masters.find(m => m.id === 'm2')!.name, 'design::Badge')
      assert.deepEqual(masters.find(m => m.id === 'm1')!.metadata, {
        type: 'component-map',
        package: 'design',
        component: 'Button',
      })
      // Screen frames are untouched by apply
      assert.equal(
        saved.children.find(c => c.id === 's1')!.name,
        'Screen: Demo'
      )

      // Idempotent: second apply is a no-op and check now passes
      const applyAgain = runApply({
        penFile,
        componentMapFile,
        log: () => {},
      })
      assert.equal(applyAgain, 0)
      const checkAfter = runCheck({
        penFile,
        componentMapFile,
        catalogOutput: path.join(dir, 'catalog2.json'),
        log: () => {},
      })
      assert.equal(checkAfter, 0, 'check must pass after apply')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
