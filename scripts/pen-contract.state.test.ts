import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  healthFamilyFixturePen,
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

function contractFor(
  pen: PenFile,
  options: { screen?: string } = {}
): { contract: PenContract; code: number } {
  mkdirSync(path.join(repoRoot, 'tmp', 'pen-contract-state-fixtures'), {
    recursive: true,
  })
  const penFile = path.join(
    repoRoot,
    'tmp',
    'pen-contract-state-fixtures',
    'state.pen'
  )
  writeFileSync(penFile, JSON.stringify(pen, null, 2))
  const result = runContract({
    penFile,
    screen: options.screen,
    log: () => {},
    jsonOut: () => {},
    exportsByPackage: syntheticExports(),
  })
  return { contract: result.contract, code: result.code }
}

describe('REP-1622 state-family validation', () => {
  it('emits a valid family as one grouped record with all four states', () => {
    const { contract, code } = contractFor(healthFamilyFixturePen())
    assert.equal(code, 0)
    assert.deepEqual(contract.stateFamilies, [
      {
        family: 'screens/admin/health',
        states: {
          content: { screenId: 'sContent', screenName: 'Admin: Health' },
          empty: { screenId: 'sEmpty', screenName: 'Admin: State: Empty' },
          loading: {
            screenId: 'sLoading',
            screenName: 'Admin: State: Loading',
          },
          error: { screenId: 'sError', screenName: 'Admin: State: Error' },
        },
      },
    ])
  })

  it('fails on a state outside the closed enum', () => {
    const pen = parsePenJson(
      JSON.stringify({
        version: '2.14',
        children: [
          screenFamilyGroup('demo', 'demo-family', [
            screenNode(
              's1',
              'Screen: Demo',
              'screens/demo/demo-family',
              'bogus'
            ),
          ]),
        ],
        variables: {},
      })
    )
    const { contract, code } = contractFor(pen)
    assert.equal(code, 1)
    assert.ok(
      contract.violations.some(v => /invalid state "bogus"/.test(v.reason)),
      contract.violations.map(v => v.reason).join('\n')
    )
  })

  it('fails when stateFamily and state are not set together', () => {
    const pen = parsePenJson(
      JSON.stringify({
        version: '2.14',
        children: [
          frameOnly('s1', 'Screen: Demo', {
            metadata: {
              type: 'screen',
              stateFamily: 'screens/demo/demo-family',
            },
          }),
          frameOnly('s2', 'Screen: Other', {
            metadata: { type: 'screen', state: 'content' },
          }),
        ],
        variables: {},
      })
    )
    const { contract, code } = contractFor(pen)
    assert.equal(code, 1)
    const reasons = contract.violations.map(v => v.reason).join('\n')
    assert.match(
      reasons,
      /stateFamily "screens\/demo\/demo-family" but no state/
    )
    assert.match(reasons, /state "content" but no stateFamily/)
  })

  it('fails when a family has no content screen or two content screens', () => {
    const noContent = parsePenJson(
      JSON.stringify({
        version: '2.14',
        children: [
          frameOnly('s1', 'Admin: State: Loading', {
            metadata: {
              type: 'screen',
              stateFamily: 'screens/admin/health',
              state: 'loading',
            },
          }),
          frameOnly('s2', 'Admin: State: Empty', {
            metadata: {
              type: 'screen',
              stateFamily: 'screens/admin/health',
              state: 'empty',
            },
          }),
        ],
        variables: {},
      })
    )
    const first = contractFor(noContent)
    assert.equal(first.code, 1)
    assert.ok(
      first.contract.violations.some(v =>
        /has no content screen/.test(v.reason)
      ),
      first.contract.violations.map(v => v.reason).join('\n')
    )
    // Family-scoped violations carry null screenId/screenName — never ''.
    const noContentViolation = first.contract.violations.find(v =>
      /has no content screen/.test(v.reason)
    )!
    assert.equal(noContentViolation.screenId, null)
    assert.equal(noContentViolation.screenName, null)

    const twoContent = parsePenJson(
      JSON.stringify({
        version: '2.14',
        children: [
          frameOnly('s1', 'Admin: A', {
            metadata: {
              type: 'screen',
              stateFamily: 'screens/admin/health',
              state: 'content',
            },
          }),
          frameOnly('s2', 'Admin: B', {
            metadata: {
              type: 'screen',
              stateFamily: 'screens/admin/health',
              state: 'content',
            },
          }),
        ],
        variables: {},
      })
    )
    const second = contractFor(twoContent)
    assert.equal(second.code, 1)
    assert.ok(
      second.contract.violations.some(v =>
        /has 2 content screens/.test(v.reason)
      ),
      second.contract.violations.map(v => v.reason).join('\n')
    )
    const twoContentViolation = second.contract.violations.find(v =>
      /has 2 content screens/.test(v.reason)
    )!
    assert.equal(twoContentViolation.screenId, null)
    assert.equal(twoContentViolation.screenName, null)
  })

  it('fails on duplicate states within a family', () => {
    const pen = parsePenJson(
      JSON.stringify({
        version: '2.14',
        children: [
          frameOnly('s1', 'Admin: Loading A', {
            metadata: {
              type: 'screen',
              stateFamily: 'screens/admin/health',
              state: 'loading',
            },
          }),
          frameOnly('s2', 'Admin: Loading B', {
            metadata: {
              type: 'screen',
              stateFamily: 'screens/admin/health',
              state: 'loading',
            },
          }),
        ],
        variables: {},
      })
    )
    const { contract, code } = contractFor(pen)
    assert.equal(code, 1)
    assert.ok(
      contract.violations.some(v => /duplicate state "loading"/.test(v.reason)),
      contract.violations.map(v => v.reason).join('\n')
    )
  })

  it('--screen skips state-family validation on the filtered screen set', () => {
    // A family whose content screen exists, but is filtered out by --screen,
    // must not produce a false "no content screen" violation.
    const pen = parsePenJson(
      JSON.stringify({
        version: '2.14',
        children: [
          screenFamilyGroup('admin', 'health', [
            screenNode(
              'sContent',
              'Admin: Health',
              'screens/admin/health',
              'content'
            ),
            screenNode(
              'sLoading',
              'Admin: State: Loading',
              'screens/admin/health',
              'loading'
            ),
          ]),
        ],
        variables: {},
      })
    )
    const { contract, code } = contractFor(pen, {
      screen: 'Admin: State: Loading',
    })
    assert.equal(code, 0)
    assert.equal(contract.clean, true)
    assert.deepEqual(
      contract.violations.map(v => v.reason),
      []
    )
    assert.equal(contract.screens.length, 1)
    assert.equal(contract.screens[0]!.screenId, 'sLoading')
  })

  it('--screen still validates the selected screen state metadata', () => {
    // Per-screen checks (state in enum, both-or-neither) are properties of
    // the screen itself and must survive --screen scoping; only the
    // family-aggregate checks are skipped for scoped runs.
    const pen = parsePenJson(
      JSON.stringify({
        version: '2.14',
        children: [
          screenFamilyGroup('demo', 'demo-family', [
            screenNode(
              'sContent',
              'Screen: Demo',
              'screens/demo/demo-family',
              'content'
            ),
            screenNode(
              'sBogus',
              'Screen: Bogus',
              'screens/demo/demo-family',
              'bogus'
            ),
          ]),
        ],
        variables: {},
      })
    )
    const { contract, code } = contractFor(pen, { screen: 'Screen: Bogus' })
    assert.equal(code, 1)
    assert.equal(contract.clean, false)
    assert.ok(
      contract.violations.some(v => /invalid state "bogus"/.test(v.reason)),
      contract.violations.map(v => v.reason).join('\n')
    )
    // No family-level aggregate fires on the filtered single-screen set.
    assert.equal(
      contract.violations.some(v => /no content screen/.test(v.reason)),
      false
    )
  })

  it('--screen still enforces both-or-neither on the selected screen', () => {
    const pen = parsePenJson(
      JSON.stringify({
        version: '2.14',
        children: [
          frameOnly('s1', 'Screen: Demo', {
            metadata: {
              type: 'screen',
              stateFamily: 'screens/demo/demo-family',
            },
          }),
        ],
        variables: {},
      })
    )
    const { contract, code } = contractFor(pen, { screen: 'Screen: Demo' })
    assert.equal(code, 1)
    assert.ok(
      contract.violations.some(v => /but no state/.test(v.reason)),
      contract.violations.map(v => v.reason).join('\n')
    )
  })
})

function frameOnly(
  id: string,
  name: string,
  extra: Record<string, unknown> = {}
) {
  return { type: 'frame', id, name, children: [], ...extra }
}
