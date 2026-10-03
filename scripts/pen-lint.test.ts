import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  buildScreensIndex,
  checkComponentExport,
  collectAllPackageExports,
  extractMasters,
  extractScreens,
  extractVariableRefs,
  extractVariables,
  inferCandidates,
  parsePenJson,
  parseSelectArg,
  resolvePackagePath,
  runCheck,
  validateVariableRefs,
} from './pen-lint.ts'

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
)

function readText(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

const frame = (
  id: string,
  name: string,
  extra: Record<string, unknown> = {}
) => ({ type: 'frame', id, name, ...extra })

const group = (name: string, id: string, children: unknown[]) => ({
  type: 'group',
  id,
  name,
  children,
})

describe('REP-1622 pen-lint validation', () => {
  it('resolvePackagePath maps a package to packages/<pkg>/', () => {
    const pkgDir = resolvePackagePath('design', repoRoot)
    assert.ok(pkgDir)
    assert.equal(path.basename(pkgDir), 'design')
    assert.equal(resolvePackagePath('does-not-exist-xyz', repoRoot), null)
  })

  it('checkComponentExport resolves direct and indirect barrels', () => {
    assert.equal(checkComponentExport('design', 'Button', repoRoot), true)
    assert.equal(checkComponentExport('design', 'AdminTable', repoRoot), true)
    assert.equal(
      checkComponentExport('design', 'DefinitelyNotAComponent', repoRoot),
      false
    )
  })

  it('validateVariableRefs reports only dangling refs (recursing into groups)', () => {
    const pen = parsePenJson(
      JSON.stringify({
        version: '2.14',
        children: [
          group('masters', 'gM', [
            group('design', 'gD', [
              frame('m1', 'Button', {
                reusable: true,
                fill: '$color-danger',
                padding: ['$spacing-xs', 8],
              }),
            ]),
          ]),
        ],
        variables: {
          'color-info': { type: 'color', value: [] },
          'spacing-xs': { type: 'number', value: 4 },
        },
      })
    )
    assert.deepEqual(validateVariableRefs(pen), ['color-danger'])
  })

  it('extractVariableRefs collects $-prefixed tokens from nested values', () => {
    const refs = extractVariableRefs({
      fill: '$color-info',
      padding: ['$spacing-xs', '$spacing-md', 8],
    })
    assert.deepEqual([...refs].sort(), [
      'color-info',
      'spacing-md',
      'spacing-xs',
    ])
  })
})

describe('REP-1622 candidate inference', () => {
  const exportsByPackage = collectAllPackageExports(repoRoot)

  it('collectAllPackageExports scans every package barrel', () => {
    assert.ok(exportsByPackage.size > 10, 'expected all packages indexed')
    assert.ok(exportsByPackage.get('design')!.has('Button'))
  })

  it('infers a single exact candidate for a component label', () => {
    const result = inferCandidates('Button', exportsByPackage)
    assert.deepEqual(result.exact, ['design::Button'])
    assert.deepEqual(result.closest, [])
  })

  it('infers multiple exact candidates ranked alphabetically by package', () => {
    const result = inferCandidates('EmptyState', exportsByPackage)
    assert.deepEqual(result.exact, [
      'agentic-ui::EmptyState',
      'design::EmptyState',
    ])
  })
})

describe('REP-1622 screens index and --select', () => {
  it('buildScreensIndex maps normalized screen names to ids', () => {
    const index = buildScreensIndex([
      {
        id: 'q7mC6b',
        name: 'Screen: Component Gallery',
        normalizedName: 'Component Gallery',
        groupPath: 'screens/demo',
      },
    ])
    assert.deepEqual(index, { 'Component Gallery': 'q7mC6b' })
  })

  it('parses comma-separated masterId=package::Component pairs', () => {
    assert.deepEqual(
      parseSelectArg(['--select', 'm1=design::Button,m2=design::Badge']),
      { m1: 'design::Button', m2: 'design::Badge' }
    )
    assert.deepEqual(parseSelectArg([]), {})
  })
})

describe('REP-1622 pen-lint wiring', () => {
  it('wires the pen-lint pre-push hook gate', () => {
    const hook = readText('.husky/pre-push')
    assert.match(hook, /tsx scripts\/pen-lint\.ts \|\| exit 1/)
    assert.match(hook, /Checking pen-lint conventions/)
  })

  it('wires pen:lint, pen:dry-run, pen:contract, and pen:migrate-groups scripts', () => {
    const packageJson = JSON.parse(readText('package.json')) as {
      scripts: Record<string, string>
    }
    assert.equal(packageJson.scripts['pen:lint'], 'tsx scripts/pen-lint.ts')
    assert.equal(
      packageJson.scripts['pen:dry-run'],
      'tsx scripts/pen-lint.ts --dry-run'
    )
    assert.equal(
      packageJson.scripts['pen:contract'],
      'tsx scripts/pen-contract.ts'
    )
    assert.equal(
      packageJson.scripts['pen:contract:check'],
      'tsx scripts/pen-contract.ts --dry-run'
    )
    assert.equal(
      packageJson.scripts['pen:migrate-groups'],
      'tsx scripts/migrate-pen-groups.ts'
    )
    assert.equal(packageJson.scripts['pen:codegen'], undefined)
  })
})

describe('REP-1622 real repro.pen integration (post-migration)', () => {
  it('every master resolves from its group path and runCheck passes', () => {
    const pen = parsePenJson(readText('repro.pen'))
    const masters = extractMasters(pen)
    const screens = extractScreens(pen)
    const variables = extractVariables(pen)
    assert.ok(masters.length >= 50, 'expected 51 masters')
    assert.ok(screens.length >= 10, 'expected at least 10 screens')
    assert.ok(Object.keys(variables).length >= 50, 'expected 79 variables')
    assert.deepEqual(validateVariableRefs(pen), [])

    for (const master of masters) {
      const segments = master.groupPath.split('/').filter(Boolean)
      assert.equal(
        segments[0],
        'masters',
        `master ${master.id} is not under masters/`
      )
      assert.equal(
        segments.length,
        2,
        `master ${master.id} is not in masters/<pkg>/`
      )
      const pkg = segments[1]!
      assert.ok(
        resolvePackagePath(pkg, repoRoot),
        `master ${master.id}: package "${pkg}" does not exist`
      )
      assert.ok(
        checkComponentExport(pkg, master.name, repoRoot),
        `master ${master.id}: "${master.name}" is not exported from @repro/${pkg}`
      )
    }

    const logs: string[] = []
    const code = runCheck({
      penFile: path.join(repoRoot, 'repro.pen'),
      catalogOutput: path.join(repoRoot, 'tmp', 'pen-catalog-test.json'),
      log: msg => logs.push(msg),
    })
    assert.equal(code, 0, logs.join('\n'))
    assert.ok(
      logs.some(l => l.includes('pen-lint check passed')),
      logs.join('\n')
    )
  })
})
