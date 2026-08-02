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
  extractJsonResponse,
  extractMasters,
  extractScreens,
  extractVariableRefs,
  extractVariables,
  inferCandidates,
  normalizeScreenName,
  parsePenJson,
  parseSelectArg,
  resolvePackagePath,
  runCheck,
  validateMasterName,
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

function fixturePen(): PenFile {
  return parsePenJson(
    JSON.stringify({
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
    })
  )
}

describe('REP-1618 pen-lint data layer', () => {
  it('parses a pen file from raw JSON', () => {
    const pen = fixturePen()
    assert.equal(pen.version, '2.14')
    assert.equal(pen.children.length, 3)
  })

  it('extractMasters returns only reusable frames with variable refs', () => {
    const masters = extractMasters(fixturePen())
    assert.equal(masters.length, 2)
    assert.equal(masters[0]!.id, 'm1')
    assert.deepEqual(masters[0]!.variableRefs, ['color-info'])
    assert.deepEqual(masters[1]!.variableRefs, [])
  })

  it('extractScreens returns non-reusable frames with normalized names', () => {
    const screens = extractScreens(fixturePen())
    assert.equal(screens.length, 1)
    assert.equal(screens[0]!.id, 's1')
    assert.equal(screens[0]!.name, 'Screen: Demo')
    assert.equal(screens[0]!.normalizedName, 'Demo')
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
    assert.equal(normalizeScreenName('Settings Form'), 'Settings Form')
  })
})

describe('REP-1618 pen-lint validation', () => {
  it('validateMasterName enforces package::ComponentName', () => {
    assert.equal(validateMasterName('design::Button'), true)
    assert.equal(validateMasterName('design::Button2'), true)
    assert.equal(validateMasterName('agentic-ui::EmptyState'), true)
    // The component part is always uppercase-first — no lowercase masters
    // remain, so lowercase component names are pattern violations.
    assert.equal(validateMasterName('design::button'), false)
    assert.equal(validateMasterName('button'), false)
    assert.equal(validateMasterName('design::'), false)
    assert.equal(validateMasterName('Design::Button'), false)
    assert.equal(validateMasterName('design::Button::Extra'), false)
  })

  it('resolvePackagePath maps a package to packages/<pkg>/', () => {
    const pkgDir = resolvePackagePath('design', repoRoot)
    assert.ok(pkgDir)
    assert.equal(path.basename(pkgDir), 'design')
    assert.equal(resolvePackagePath('does-not-exist-xyz', repoRoot), null)
  })

  it('checkComponentExport resolves direct and indirect barrels', () => {
    assert.equal(checkComponentExport('design', 'Button', repoRoot), true)
    assert.equal(
      checkComponentExport('design', 'ListPageFooter', repoRoot),
      true
    )
    assert.equal(
      checkComponentExport('design', 'RefreshProgressBar', repoRoot),
      true
    )
    assert.equal(checkComponentExport('design', 'Table', repoRoot), true)
    assert.equal(checkComponentExport('design', 'AdminTable', repoRoot), true)
    assert.equal(checkComponentExport('design', 'Toast', repoRoot), true)
    assert.equal(
      checkComponentExport('design', 'DefinitelyNotAComponent', repoRoot),
      false
    )
  })

  it('validateVariableRefs reports only dangling refs', () => {
    const pen = parsePenJson(
      JSON.stringify({
        version: '2.14',
        children: [
          frame('m1', 'design::Button', {
            reusable: true,
            fill: '$color-danger',
            padding: ['$spacing-xs', 8],
          }),
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
      strokeWidth: { left: 4 },
      effect: { shadowType: 'outer', color: '$color-text-secondary' },
    })
    assert.deepEqual([...refs].sort(), [
      'color-info',
      'color-text-secondary',
      'spacing-md',
      'spacing-xs',
    ])
  })
})

describe('REP-1618 candidate inference', () => {
  const exportsByPackage = collectAllPackageExports(repoRoot)

  it('collectAllPackageExports scans every package barrel', () => {
    assert.ok(exportsByPackage.size > 10, 'expected all packages indexed')
    assert.ok(
      exportsByPackage.get('design')!.has('Button'),
      'design exports Button'
    )
    assert.ok(
      exportsByPackage.get('agentic-ui')!.has('EmptyState'),
      'agentic-ui exports EmptyState'
    )
  })

  it('infers a single exact candidate for a design master', () => {
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
    assert.deepEqual(result.closest, [])
  })

  it('resolves AdminTable as an exact candidate once the export exists', () => {
    const result = inferCandidates('AdminTable', exportsByPackage)
    assert.deepEqual(result.exact, ['design::AdminTable'])
    assert.deepEqual(result.closest, [])
  })

  it('resolves Toast as an exact candidate once the export exists', () => {
    // Toast is now a real @repro/design export (REP-1621): the uppercase-first
    // component part binds exactly, so no case-insensitive fallback is needed.
    const result = inferCandidates('Toast', exportsByPackage)
    assert.deepEqual(result.exact, ['design::Toast'])
    assert.deepEqual(result.closest, [])
  })
})

describe('REP-1618 pen-lint export response parsing', () => {
  it('extractJsonResponse pulls the tool JSON from a mixed stream', () => {
    const stream =
      '[INFO] Ready.\n\u001b[36mpen\u001b[39m \u001b[2m>\u001b[22m {\n' +
      '  "html": "<!doctype html><div>hi</div>",\n  "warnings": []\n}\n\nGoodbye.'
    const parsed = extractJsonResponse(stream)
    assert.ok(parsed && typeof parsed === 'object')
    assert.equal(
      (parsed as Record<string, unknown>).html,
      '<!doctype html><div>hi</div>'
    )
  })

  it('extractJsonResponse ignores non-JSON tool chatter', () => {
    const stream = 'pen > Exported 1 file(s):\n/tmp/out.png\n\nGoodbye.'
    assert.equal(extractJsonResponse(stream), null)
  })
})

describe('REP-1618 screens index', () => {
  it('buildScreensIndex maps normalized screen names to ids', () => {
    const index = buildScreensIndex([
      {
        id: 'q7mC6b',
        name: 'Screen: Component Gallery',
        normalizedName: 'Component Gallery',
      },
      {
        id: 'HmP9z',
        name: 'Admin: Recordings',
        normalizedName: 'Admin: Recordings',
      },
    ])
    assert.deepEqual(index, {
      'Component Gallery': 'q7mC6b',
      'Admin: Recordings': 'HmP9z',
    })
  })
})

describe('REP-1618 --select argument parsing', () => {
  it('parses comma-separated masterId=package::Component pairs', () => {
    assert.deepEqual(
      parseSelectArg(['--select', 'm1=design::Button,m2=design::Badge']),
      { m1: 'design::Button', m2: 'design::Badge' }
    )
  })

  it('silently skips malformed parts (no "=", empty id or name)', () => {
    assert.deepEqual(
      parseSelectArg([
        '--select',
        'm1=design::Button,garbage,=design::Badge,m2=,m3=design::Card',
      ]),
      { m1: 'design::Button', m3: 'design::Card' }
    )
  })

  it('returns an empty map when --select is absent', () => {
    assert.deepEqual(parseSelectArg([]), {})
    assert.deepEqual(parseSelectArg(['--apply']), {})
    assert.deepEqual(parseSelectArg(['--select']), {})
  })
})

describe('REP-1618 pen-lint wiring', () => {
  it('wires the pen-lint pre-push hook gate', () => {
    // REP-1621 reconciled the pen file, so the hook now gates on pen-lint.
    const hook = readText('.husky/pre-push')
    assert.match(hook, /tsx scripts\/pen-lint\.ts \|\| exit 1/)
    assert.match(hook, /Checking pen-lint conventions/)
  })

  it('adds the pen:lint and pen:dry-run scripts to package.json', () => {
    const packageJson = JSON.parse(readText('package.json')) as {
      scripts: Record<string, string>
    }
    assert.equal(packageJson.scripts['pen:lint'], 'tsx scripts/pen-lint.ts')
    assert.equal(
      packageJson.scripts['pen:dry-run'],
      'tsx scripts/pen-lint.ts --dry-run'
    )
  })
})

describe('REP-1618 real repro.pen integration (read-only)', () => {
  it('every master is package::ComponentName-conforming and resolves to an export', () => {
    const pen = parsePenJson(readText('repro.pen'))
    const masters = extractMasters(pen)
    const screens = extractScreens(pen)
    const variables = extractVariables(pen)
    assert.ok(masters.length >= 50, 'expected 51 masters')
    assert.ok(screens.length >= 10, 'expected 11 screens')
    assert.ok(Object.keys(variables).length >= 50, 'expected 79 variables')
    assert.deepEqual(validateVariableRefs(pen), [])

    // Naming convention replaces the component map: every master conforms to
    // package::ComponentName and its component part resolves to a real export.
    for (const master of masters) {
      assert.ok(
        validateMasterName(master.name),
        `master ${master.id} "${master.name}" is not package::ComponentName`
      )
      const [pkg, comp] = master.name.split('::') as [string, string]
      assert.ok(
        resolvePackagePath(pkg, repoRoot),
        `master ${master.id}: package "${pkg}" does not exist`
      )
      assert.ok(
        checkComponentExport(pkg, comp, repoRoot),
        `master ${master.id}: "${comp}" is not exported from @repro/${pkg}`
      )
    }
  })

  it('runCheck passes with zero violations after REP-1621', () => {
    const logs: string[] = []
    const code = runCheck({
      penFile: path.join(repoRoot, 'repro.pen'),
      catalogOutput: path.join(repoRoot, 'tmp', 'pen-catalog-test.json'),
      log: msg => logs.push(msg),
    })
    assert.equal(code, 0, logs.join('\n'))
    const violations = logs.filter(l => l.startsWith('violation:'))
    assert.equal(violations.length, 0, violations.join('\n'))
    assert.ok(
      logs.some(l => l.includes('pen-lint check passed')),
      logs.join('\n')
    )
  })
})
