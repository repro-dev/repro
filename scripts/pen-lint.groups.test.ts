// REP-1622 pen-lint group data layer + state-family unit tests.
// Split out of scripts/pen-lint.test.ts to keep test files under the CI size
// guardrails (400 warn / 500 error lines).
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { PenFile } from './pen-lint.ts'
import {
  extractMasters,
  extractScreens,
  extractStateFamilies,
  extractVariables,
  findNodesRecursive,
  findNodesRecursiveWithPath,
  isScreenState,
  normalizeScreenName,
  parsePenJson,
  uuidv5,
  validateStateFamilies,
} from './pen-lint.ts'

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

  it('frames inside a group nested inside a frame are not collection-level', () => {
    // A Group inside a screen's children must not make that Group's child
    // frames look like collection-level masters/screens (a screen's internal
    // layout can use groups for slots).
    const pen = parsePenJson(
      JSON.stringify({
        version: '2.14',
        children: [
          group('screens', 'gS', [
            group('demo', 'gDemo', [
              group('f', 'gF', [
                frame('s1', 'Screen: Demo', {
                  children: [
                    group('slots', 'gSlots', [
                      frame('phantomMaster', 'Button', { reusable: true }),
                      frame('phantomScreen', 'Nested', {}),
                    ]),
                  ],
                }),
              ]),
            ]),
          ]),
        ],
        variables: {},
      })
    )
    const masters = extractMasters(pen)
    const screens = extractScreens(pen)
    assert.equal(
      masters.some(m => m.id === 'phantomMaster'),
      false,
      'reusable frame inside a nested group is not a master'
    )
    assert.equal(
      screens.some(s => s.id === 'phantomScreen'),
      false,
      'non-reusable frame inside a nested group is not a screen'
    )
    assert.equal(
      screens.some(s => s.id === 's1'),
      true,
      'the real screen is still extracted'
    )
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

  it('validateStateFamilies excludes non-enum states from family membership', () => {
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
    // Two screens share the invalid state "bogus" in one family. The invalid
    // state is reported per-screen, but must NOT also trigger a "duplicate
    // state" violation referencing a state that extractStateFamilies (and
    // the contract's stateFamilies output) never shows.
    const violations = validateStateFamilies(
      screens([
        { id: 'a', family: 'f', state: 'bogus' },
        { id: 'b', family: 'f', state: 'bogus' },
      ])
    )
    assert.equal(
      violations.filter(v => /invalid state "bogus"/.test(v.reason)).length,
      2
    )
    assert.equal(
      violations.some(v => /duplicate state/.test(v.reason)),
      false,
      violations.map(v => v.reason).join('\n')
    )
    // And a valid content screen in the family is the only content counted.
    const mixed = validateStateFamilies(
      screens([
        { id: 'content', family: 'f', state: 'content' },
        { id: 'bogus', family: 'f', state: 'bogus' },
      ])
    )
    assert.equal(
      mixed.some(v => /has 2 content screens/.test(v.reason)),
      false
    )
    assert.equal(
      mixed.some(v => /invalid state "bogus"/.test(v.reason)),
      true
    )
  })
})
