import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import type { PenFile } from './pen-lint.ts'
import {
  buildScreensIndex,
  checkComponentExport,
  determinePackagePrefix,
  extractJsonResponse,
  extractMasters,
  extractScreens,
  extractVariableRefs,
  extractVariables,
  normalizeScreenName,
  parsePenJson,
  resolvePackagePath,
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

describe('REP-1620 pen-lint data layer', () => {
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

describe('REP-1620 pen-lint validation', () => {
  it('validateMasterName enforces package::ComponentName', () => {
    assert.equal(validateMasterName('design::Button'), true)
    assert.equal(validateMasterName('design::Button2'), true)
    assert.equal(validateMasterName('button'), false)
    assert.equal(validateMasterName('design::'), false)
    assert.equal(validateMasterName('Design::Button'), false)
    assert.equal(validateMasterName('design::button'), false)
    assert.equal(validateMasterName('design::Button::Extra'), false)
  })

  it('determinePackagePrefix parses the code field', () => {
    assert.deepEqual(determinePackagePrefix('@repro/design Button'), {
      pkg: 'design',
      comp: 'Button',
    })
    assert.deepEqual(
      determinePackagePrefix('@repro/design Table (Header/Row/Cell)'),
      {
        pkg: 'design',
        comp: 'Table',
      }
    )
    assert.equal(determinePackagePrefix('garbage'), null)
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

describe('REP-1620 pen-lint export response parsing', () => {
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

describe('REP-1620 screens index', () => {
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

describe('REP-1620 pen-lint wiring', () => {
  it('defers the pen-lint pre-push hook gate to REP-1621', () => {
    // The pre-push hook does not gate on pen-lint yet — wiring is deferred to
    // REP-1621 until pen file violations are reconciled. Assert the deferral.
    const hook = readText('.husky/pre-push')
    assert.doesNotMatch(
      hook,
      /pen-lint/,
      'pre-push hook must not reference pen-lint (deferred to REP-1621)'
    )
  })

  it('adds the pen:lint script to package.json', () => {
    const packageJson = JSON.parse(readText('package.json')) as {
      scripts: Record<string, string>
    }
    assert.equal(packageJson.scripts['pen:lint'], 'tsx scripts/pen-lint.ts')
  })
})

describe('REP-1620 real repro.pen integration (read-only)', () => {
  it('enumerates masters, screens, and variables with no dangling refs', () => {
    const pen = parsePenJson(readText('repro.pen'))
    const masters = extractMasters(pen)
    const screens = extractScreens(pen)
    const variables = extractVariables(pen)
    assert.ok(masters.length >= 50, 'expected 51 masters')
    assert.ok(screens.length >= 10, 'expected 11 screens')
    assert.ok(Object.keys(variables).length >= 50, 'expected 79 variables')
    assert.deepEqual(validateVariableRefs(pen), [])

    // Every master must resolve to a component-map entry by masterId
    const componentMap = JSON.parse(readText('pen-component-map.json')) as {
      components: Record<string, { masterId: string; code: string }>
    }
    const ids = new Set(
      Object.values(componentMap.components).map(c => c.masterId)
    )
    for (const master of masters) {
      assert.ok(ids.has(master.id), `master ${master.id} has no map entry`)
    }
  })
})
