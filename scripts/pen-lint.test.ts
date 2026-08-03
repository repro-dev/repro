import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import type { PenFile } from './pen-lint.ts'
import {
  buildScreensIndex,
  checkComponentExport,
  collectAllPackageExports,
  extractMasters,
  extractScreens,
  extractStateFamilies,
  extractVariableRefs,
  extractVariables,
  findNodesRecursive,
  findNodesRecursiveWithPath,
  inferCandidates,
  isScreenState,
  normalizeScreenName,
  parsePenJson,
  parseSelectArg,
  resolvePackagePath,
  runCheck,
  uuidv5,
  validateStateFamilies,
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

/** Grouped fixture: masters under masters/design, screens under screens/. */
function fixturePen(): PenFile {
  return parsePenJson(
    JSON.stringify({
      version: '2.14',
      children: [
        group('masters', 'gM', [
          group('design', 'gD', [
            frame('m1', 'Button', {
              reusable: true,
              height: 36,
              fill: '$color-info',
              metadata: {
                type: 'master',
                package: 'design',
                component: 'Button',
              },
            }),
            frame('m2', 'Badge', {
              reusable: true,
              height: 24,
              metadata: {
                type: 'master',
                package: 'design',
                component: 'Badge',
              },
            }),
          ]),
        ]),
        group('screens', 'gS', [
          group('demo', 'gDemo', [
            group('demo-family', 'gDemoFam', [
              frame('s1', 'Screen: Demo', {
                width: 400,
                height: 300,
                children: [],
                metadata: {
                  type: 'screen',
                  stateFamily: 'screens/demo/demo-family',
                  state: 'content',
                },
              }),
            ]),
          ]),
        ]),
      ],
      variables: { 'color-info': { type: 'color', value: [] } },
    })
  )
}

describe('REP-1622 pen-lint group data layer', () => {
  it('parses a pen file from raw JSON', () => {
    const pen = fixturePen()
    assert.equal(pen.version, '2.14')
  })

  it('findNodesRecursive walks into groups', () => {
    const nodes = findNodesRecursive(fixturePen().children)
    assert.deepEqual(
      nodes.map(n => n.id),
      ['gM', 'gD', 'm1', 'm2', 'gS', 'gDemo', 'gDemoFam', 's1']
    )
  })

  it('findNodesRecursiveWithPath carries the group path', () => {
    const located = findNodesRecursiveWithPath(fixturePen().children)
    const byId = new Map(located.map(l => [l.node.id, l]))
    assert.equal(byId.get('m1')!.groupPath, 'masters/design')
    assert.equal(byId.get('s1')!.groupPath, 'screens/demo/demo-family')
    assert.equal(byId.get('gM')!.groupPath, '')
  })

  it('uuidv5 is deterministic and version-5 formatted', () => {
    const a = uuidv5('masters/design')
    const b = uuidv5('masters/design')
    assert.equal(a, b)
    assert.match(
      a,
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    )
    assert.notEqual(uuidv5('masters/design'), uuidv5('screens/admin'))
  })

  it('extractMasters finds reusable frames inside groups with groupPath', () => {
    const masters = extractMasters(fixturePen())
    assert.equal(masters.length, 2)
    assert.equal(masters[0]!.id, 'm1')
    assert.equal(masters[0]!.groupPath, 'masters/design')
    assert.deepEqual(masters[0]!.variableRefs, ['color-info'])
  })

  it('extractScreens finds screens inside groups and excludes master subtrees', () => {
    const pen = parsePenJson(
      JSON.stringify({
        version: '2.14',
        children: [
          group('masters', 'gM', [
            group('design', 'gD', [
              // A non-reusable frame INSIDE a master is not a screen.
              frame('m1', 'Button', {
                reusable: true,
                children: [frame('inner', 'Track', { children: [] })],
              }),
            ]),
          ]),
          group('screens', 'gS', [
            group('demo', 'gDemo', [
              group('f', 'gF', [frame('s1', 'Screen: Demo', { children: [] })]),
            ]),
          ]),
          // Top-level frames remain screens for backward compatibility.
          frame('s2', 'Screen: Legacy', { children: [] }),
        ],
        variables: {},
      })
    )
    const screens = extractScreens(pen)
    assert.deepEqual(
      screens.map(s => s.id),
      ['s1', 's2']
    )
    assert.equal(screens[0]!.groupPath, 'screens/demo/f')
  })

  it('extractVariables returns the declared variable map', () => {
    const variables = extractVariables(fixturePen())
    assert.deepEqual(Object.keys(variables), ['color-info'])
  })

  it('normalizeScreenName strips only the "Screen: " prefix', () => {
    assert.equal(
      normalizeScreenName('Screen: Component Gallery'),
      'Component Gallery'
    )
    assert.equal(normalizeScreenName('Admin: Recordings'), 'Admin: Recordings')
  })
})

describe('REP-1622 state families', () => {
  it('isScreenState validates the closed enum', () => {
    assert.equal(isScreenState('content'), true)
    assert.equal(isScreenState('loading'), true)
    assert.equal(isScreenState('empty'), true)
    assert.equal(isScreenState('error'), true)
    assert.equal(isScreenState('bogus'), false)
    assert.equal(isScreenState(undefined), false)
  })

  it('extractStateFamilies groups screens by stateFamily with state -> screen', () => {
    const pen = parsePenJson(
      JSON.stringify({
        version: '2.14',
        children: [
          group('screens', 'gS', [
            group('admin', 'gA', [
              group('health', 'gH', [
                frame('s1', 'Admin: Health', {
                  children: [],
                  metadata: {
                    type: 'screen',
                    stateFamily: 'screens/admin/health',
                    state: 'content',
                  },
                }),
                frame('s2', 'Admin: State: Loading', {
                  children: [],
                  metadata: {
                    type: 'screen',
                    stateFamily: 'screens/admin/health',
                    state: 'loading',
                  },
                }),
              ]),
            ]),
          ]),
        ],
        variables: {},
      })
    )
    const families = extractStateFamilies(extractScreens(pen))
    assert.deepEqual([...families.keys()], ['screens/admin/health'])
    assert.deepEqual(
      Object.keys(families.get('screens/admin/health')!.content!),
      ['screenId', 'screenName']
    )
    assert.equal(families.get('screens/admin/health')!.content!.screenId, 's1')
    assert.equal(
      families.get('screens/admin/health')!.loading!.screenName,
      'Admin: State: Loading'
    )
  })

  it('validateStateFamilies enforces the family invariants', () => {
    const screens = (
      list: Array<{ id: string; family?: string; state?: string }>
    ) =>
      list.map(({ id, family, state }) => ({
        id,
        name: id,
        normalizedName: id,
        groupPath: 'screens/admin',
        stateFamily: family,
        state,
      }))
    // Valid: exactly one content, unique states.
    assert.deepEqual(
      validateStateFamilies(
        screens([
          { id: 'a', family: 'f', state: 'content' },
          { id: 'b', family: 'f', state: 'loading' },
        ])
      ),
      []
    )
    // Both-or-neither.
    assert.deepEqual(
      validateStateFamilies(screens([{ id: 'a', family: 'f' }])).map(
        v => v.reason
      ),
      [
        'screen has stateFamily "f" but no state (stateFamily and state must be set together)',
      ]
    )
    assert.deepEqual(
      validateStateFamilies(screens([{ id: 'a', state: 'content' }])).map(
        v => v.reason
      ),
      [
        'screen has state "content" but no stateFamily (stateFamily and state must be set together)',
      ]
    )
    // Invalid enum member.
    assert.match(
      validateStateFamilies(
        screens([{ id: 'a', family: 'f', state: 'bogus' }])
      )[0]!.reason,
      /invalid state "bogus"/
    )
    // Missing content.
    assert.match(
      validateStateFamilies(
        screens([{ id: 'a', family: 'f', state: 'loading' }])
      )[0]!.reason,
      /has no content screen/
    )
    // Duplicate states.
    assert.ok(
      validateStateFamilies(
        screens([
          { id: 'a', family: 'f', state: 'loading' },
          { id: 'b', family: 'f', state: 'loading' },
        ])
      ).some(v => /duplicate state "loading"/.test(v.reason))
    )
  })
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
    assert.ok(screens.length >= 10, 'expected 11 screens')
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
