import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  alertMaster,
  buttonMaster,
  contractFixturePen,
  mastersGroup,
  refNode,
  screenFamilyGroup,
  screenNode,
  syntheticExports,
} from './pen-contract.test-helpers.ts'
import type { PenContract } from './pen-contract.ts'
import { runContract } from './pen-contract.ts'
import type { PenFile } from './pen-lint.ts'
import { parsePenJson } from './pen-lint.ts'

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
)

const FIXTURE_DIR = path.join(repoRoot, 'tmp', 'pen-contract-fixtures')

function contractFor(pen: PenFile): {
  contract: PenContract
  json: string
  code: number
} {
  mkdirSync(FIXTURE_DIR, { recursive: true })
  const penFile = path.join(FIXTURE_DIR, 'fixture.pen')
  writeFileSync(penFile, JSON.stringify(pen, null, 2))
  const jsonOuts: string[] = []
  const result = runContract({
    penFile,
    log: () => {},
    jsonOut: json => jsonOuts.push(json),
    exportsByPackage: syntheticExports(),
  })
  return {
    contract: result.contract,
    json: jsonOuts.join('\n'),
    code: result.code,
  }
}

describe('REP-1622 contract JSON schema', () => {
  it('emits a clean v1 contract for a resolvable screen', () => {
    const { contract, code } = contractFor(contractFixturePen())
    assert.equal(code, 0)
    assert.equal(contract.mode, 'contract')
    assert.equal(contract.penVersion, '2.14')
    assert.equal(contract.clean, true)
    assert.equal(contract.screenCount, 1)
    assert.equal(contract.violations.length, 0)
    assert.equal(contract.warnings.length, 0)

    const screen = contract.screens[0]!
    assert.equal(screen.screenId, 's1')
    assert.equal(screen.screenName, 'Screen: Demo')
    assert.equal(screen.groupPath, 'screens/demo/demo-family')
    assert.equal(screen.stateFamily, 'screens/demo/demo-family')
    assert.equal(screen.state, 'content')

    // The ref resolves to a concrete component from its group path.
    const ref = screen.tree.children![0]!
    assert.equal(ref.type, 'ref')
    assert.equal(ref.masterId, 'btnMaster')
    assert.deepEqual(ref.component, {
      package: 'design',
      export: 'Button',
      import: '@repro/design',
    })
    assert.deepEqual(ref.presentationalOverrides, {
      context: 'success',
      children: 'Save changes',
    })

    assert.deepEqual(contract.stateFamilies, [
      {
        family: 'screens/demo/demo-family',
        states: { content: { screenId: 's1', screenName: 'Screen: Demo' } },
      },
    ])
  })

  it('is deterministic: two runs produce byte-identical JSON', () => {
    const pen = contractFixturePen()
    const first = contractFor(pen).json
    const second = contractFor(pen).json
    assert.equal(first, second)
  })

  it('determinism survives a real regenerate on the same disk file', () => {
    // The actual "same input, re-run" scenario: write the pen once, then run
    // the contract twice on the same file WITHOUT rewriting in between, and
    // assert byte-identical output.
    mkdirSync(FIXTURE_DIR, { recursive: true })
    const penFile = path.join(FIXTURE_DIR, 'regenerate.pen')
    writeFileSync(penFile, JSON.stringify(contractFixturePen(), null, 2))
    const firstOuts: string[] = []
    const secondOuts: string[] = []
    const run = (jsonOut: (json: string) => void) =>
      runContract({
        penFile,
        log: () => {},
        jsonOut,
        exportsByPackage: syntheticExports(),
      })
    assert.equal(run(json => firstOuts.push(json)).code, 0)
    assert.equal(run(json => secondOuts.push(json)).code, 0)
    assert.equal(firstOuts.join('\n'), secondOuts.join('\n'))
  })
})

describe('REP-1622 path-based master resolution', () => {
  it('reports an unresolvable master with did-you-mean candidates', () => {
    // The master sits at top level (no masters/<pkg> group), so path-based
    // resolution fails and inference surfaces the did-you-mean candidate.
    const pen = parsePenJson(
      JSON.stringify({
        version: '2.14',
        children: [
          buttonMaster('unknownMaster'),
          screenFamilyGroup('demo', 'demo-family', [
            screenNode(
              's1',
              'Screen: Demo',
              'screens/demo/demo-family',
              'content',
              [refNode('r1', 'unknownMaster', 'Button')]
            ),
          ]),
        ],
        variables: {},
      })
    )
    const { contract, code } = contractFor(pen)
    assert.equal(code, 1)
    assert.equal(contract.clean, false)
    assert.equal(contract.screens[0]!.tree.children![0]!.component, undefined)
    const violation = contract.violations[0]!
    assert.equal(violation.screenId, 's1')
    assert.equal(violation.refId, 'r1')
    assert.match(violation.reason, /did you mean/)
    assert.deepEqual(violation.candidates, ['design::Button'])
  })

  it('reports a ref to an unknown master id', () => {
    const pen = parsePenJson(
      JSON.stringify({
        version: '2.14',
        children: [
          screenFamilyGroup('demo', 'demo-family', [
            screenNode(
              's1',
              'Screen: Demo',
              'screens/demo/demo-family',
              'content',
              [refNode('r1', 'noSuchMaster', 'Save')]
            ),
          ]),
        ],
        variables: {},
      })
    )
    const { contract, code } = contractFor(pen)
    assert.equal(code, 1)
    const violation = contract.violations[0]!
    assert.match(violation.reason, /unknown master/)
    assert.deepEqual(violation.candidates, [])
  })
})

describe('REP-1622 closed override vocabulary (v1)', () => {
  it('maps Button variant (transparent + stroke -> outlined, transparent -> text)', () => {
    const pen = parsePenJson(
      JSON.stringify({
        version: '2.14',
        children: [
          mastersGroup(buttonMaster()),
          screenFamilyGroup('demo', 'demo-family', [
            screenNode(
              's1',
              'Screen: Demo',
              'screens/demo/demo-family',
              'content',
              [
                refNode('rOutlined', 'btnMaster', 'Cancel', {
                  fill: '#00000000',
                  stroke: '$color-neutral-border',
                  strokeWidth: 1,
                  strokeAlignment: 'inner',
                  effect: [],
                  height: 28,
                  padding: [0, 10],
                  gap: 5,
                  cornerRadius: 5,
                  descendants: { btnLabel: { content: 'Cancel' } },
                }),
                refNode('rText', 'btnMaster', 'Learn more', {
                  fill: '#00000000',
                  stroke: '#00000000',
                  effect: [],
                  descendants: { btnLabel: { content: 'Learn more' } },
                }),
                refNode('rPlain', 'btnMaster', 'Save', {
                  descendants: { btnLabel: { content: 'Save' } },
                }),
              ]
            ),
          ]),
        ],
        variables: {},
      })
    )
    const { contract } = contractFor(pen)
    const refs = contract.screens[0]!.tree.children!
    assert.deepEqual(refs[0]!.presentationalOverrides, {
      variant: 'outlined',
      size: 'small',
      children: 'Cancel',
    })
    assert.deepEqual(refs[1]!.presentationalOverrides, {
      variant: 'text',
      children: 'Learn more',
    })
    // Default button: no fill/height overrides -> only the label maps.
    assert.deepEqual(refs[2]!.presentationalOverrides, { children: 'Save' })
  })

  it('maps Alert tint + message, and warns on unmapped overrides', () => {
    const pen = parsePenJson(
      JSON.stringify({
        version: '2.14',
        children: [
          mastersGroup(alertMaster()),
          screenFamilyGroup('demo', 'demo-family', [
            screenNode(
              's1',
              'Screen: Demo',
              'screens/demo/demo-family',
              'content',
              [
                refNode('rAlert', 'alertMaster', 'Warning', {
                  width: 440,
                  fill: '$color-warning-tint',
                  stroke: '$color-warning-border-subtle',
                  descendants: {
                    alertMsg: {
                      content: 'Storage is almost full.',
                      fill: '$color-warning',
                    },
                    alertIcon: { fill: '$color-warning' },
                    alertExtra: { fill: '$color-warning' },
                  },
                }),
              ]
            ),
          ]),
        ],
        variables: {},
      })
    )
    const { contract, code } = contractFor(pen)
    assert.equal(code, 0, 'unmapped overrides are warnings, not violations')
    assert.equal(contract.clean, true)
    const ref = contract.screens[0]!.tree.children![0]!
    assert.deepEqual(ref.presentationalOverrides, {
      type: 'warning',
      children: 'Storage is almost full.',
    })
    assert.deepEqual(contract.warnings, [
      'Alert: unmapped descendant override "alertExtra" (no matching node in master)',
    ])
  })

  it('maps Button opacity 0.5 to disabled (value validation in vocabulary suite)', () => {
    const pen = parsePenJson(
      JSON.stringify({
        version: '2.14',
        children: [
          mastersGroup(buttonMaster()),
          screenFamilyGroup('demo', 'demo-family', [
            screenNode(
              's1',
              'Screen: Demo',
              'screens/demo/demo-family',
              'content',
              [
                refNode('rDisabled', 'btnMaster', 'Disabled', {
                  opacity: 0.5,
                  descendants: { btnLabel: { content: 'Disabled' } },
                }),
              ]
            ),
          ]),
        ],
        variables: {},
      })
    )
    const { contract } = contractFor(pen)
    assert.deepEqual(contract.warnings, [])
    const ref = contract.screens[0]!.tree.children![0]!
    assert.deepEqual(ref.presentationalOverrides, {
      disabled: true,
      children: 'Disabled',
    })
  })

  it('does not treat a scalar type override as a node replacement', () => {
    // { type: 'frame', fill } carries styling but no children; it is NOT a
    // structural replacement. It must not splice an empty frame node into the
    // tree and silently discard the styling.
    const pen = parsePenJson(
      JSON.stringify({
        version: '2.14',
        children: [
          mastersGroup(buttonMaster()),
          screenFamilyGroup('demo', 'demo-family', [
            screenNode(
              's1',
              'Screen: Demo',
              'screens/demo/demo-family',
              'content',
              [
                refNode('r1', 'btnMaster', 'Save', {
                  descendants: {
                    btnLabel: { type: 'frame', fill: '#ffffff' },
                  },
                }),
              ]
            ),
          ]),
        ],
        variables: {},
      })
    )
    const { contract, code } = contractFor(pen)
    assert.equal(code, 0)
    const ref = contract.screens[0]!.tree.children![0]!
    assert.equal(
      ref.children,
      undefined,
      'no phantom empty frame node was spliced in'
    )
    // The styling override is surfaced as a warning, not silently dropped.
    assert.ok(
      contract.warnings.some(w =>
        w.includes('unmapped descendant override "btnLabel"')
      ),
      contract.warnings.join('\n')
    )
  })

  it('warns distinctly when a descendant path is deeper than 2 segments', () => {
    // 'a/b/c' is a nested ref path beyond v1 support. The consumer must be
    // able to tell "unsupported path" apart from "node not found".
    const pen = parsePenJson(
      JSON.stringify({
        version: '2.14',
        children: [
          mastersGroup(buttonMaster()),
          screenFamilyGroup('demo', 'demo-family', [
            screenNode(
              's1',
              'Screen: Demo',
              'screens/demo/demo-family',
              'content',
              [
                refNode('r1', 'btnMaster', 'Save', {
                  descendants: { 'btnLabel/nested/deep': { content: 'x' } },
                }),
              ]
            ),
          ]),
        ],
        variables: {},
      })
    )
    const { contract, code } = contractFor(pen)
    assert.equal(code, 0)
    assert.ok(
      contract.warnings.some(w =>
        w.includes('descendant path deeper than 2 segments')
      ),
      contract.warnings.join('\n')
    )
    assert.equal(
      contract.warnings.some(w => w.includes('no matching node in master')),
      false
    )
  })

  it('warns distinctly when a slash-key left segment resolves to a non-ref', () => {
    // 'slotFrame/inner' — the left segment exists in the master but is a
    // frame, not a ref. The warning must be distinct from the generic
    // "no matching node in master" so the consumer can tell the two apart.
    const shellMaster = {
      type: 'frame',
      id: 'shellMaster',
      name: 'AppShell',
      reusable: true,
      metadata: { type: 'master', package: 'design', component: 'AppShell' },
      children: [
        { type: 'frame', id: 'slotFrame', name: 'Slot', children: [] },
      ],
    }
    const pen = parsePenJson(
      JSON.stringify({
        version: '2.14',
        children: [
          mastersGroup(shellMaster),
          screenFamilyGroup('demo', 'demo-family', [
            screenNode(
              's1',
              'Screen: Demo',
              'screens/demo/demo-family',
              'content',
              [
                refNode('r1', 'shellMaster', 'Shell', {
                  descendants: { 'slotFrame/inner': { content: 'x' } },
                }),
              ]
            ),
          ]),
        ],
        variables: {},
      })
    )
    const { contract, code } = contractFor(pen)
    assert.equal(code, 0, 'unsupported paths are warnings, not violations')
    assert.ok(
      contract.warnings.some(w => w.includes('is not a ref')),
      contract.warnings.join('\n')
    )
    assert.equal(
      contract.warnings.some(w => w.includes('no matching node in master')),
      false
    )
  })
})

describe('REP-1622 real repro.pen integration (post-migration)', () => {
  it('contract on the real pen is clean and deterministic', () => {
    const jsonOuts: string[] = []
    const result = runContract({
      penFile: path.join(repoRoot, 'repro.pen'),
      log: () => {},
      jsonOut: json => jsonOuts.push(json),
    })
    assert.equal(result.code, 0)
    assert.equal(result.contract.clean, true)
    assert.equal(result.contract.screenCount, 21)
    // State family for the admin health screens is present and complete.
    const health = result.contract.stateFamilies.find(
      f => f.family === 'screens/admin/health'
    )
    assert.ok(health)
    assert.deepEqual(Object.keys(health.states).sort(), [
      'content',
      'empty',
      'error',
      'loading',
    ])

    // REP-1629: the 50 remaining warnings are exactly the intentional-gap set.
    assert.equal(result.contract.warnings.length, 50)
    const gapCounts: Record<string, number> = {}
    for (const w of result.contract.warnings) {
      gapCounts[w.split(':')[0]!] = (gapCounts[w.split(':')[0]!] ?? 0) + 1
    }
    assert.deepEqual(gapCounts, {
      AdminTable: 16,
      AppShell: 5,
      Button: 1,
      Breadcrumbs: 4,
      EmptyState: 4,
      Tabs: 4,
      Accordion: 2,
      Card: 3,
      RefreshProgressBar: 2,
      Select: 6,
      TextField: 3,
    })
    const secondOuts: string[] = []
    runContract({
      penFile: path.join(repoRoot, 'repro.pen'),
      log: () => {},
      jsonOut: json => secondOuts.push(json),
    })
    assert.equal(jsonOuts.join('\n'), secondOuts.join('\n'), 'determinism')
  })
})
