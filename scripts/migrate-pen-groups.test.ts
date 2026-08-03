import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  classifyScreen,
  migratePenGroups,
  PEN_FILE,
  resolvePenFileArg,
} from './migrate-pen-groups.ts'
import type { PenFile, PenNode } from './pen-lint.ts'
import {
  extractMasters,
  extractScreens,
  parsePenJson,
  uuidv5,
} from './pen-lint.ts'

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
)

const frame = (
  id: string,
  name: string,
  extra: Record<string, unknown> = {}
): PenNode => ({ type: 'frame', id, name, ...extra })

const masterFrame = (
  id: string,
  pkg: string,
  comp: string,
  extra: Record<string, unknown> = {}
): PenNode =>
  frame(id, `${pkg}::${comp}`, {
    reusable: true,
    height: 36,
    fill: '$color-info',
    metadata: { type: 'master', package: pkg, component: comp },
    ...extra,
  })

const group = (name: string, id: string, children: PenNode[]): PenNode => ({
  type: 'group',
  id,
  name,
  x: 0,
  y: 0,
  children,
})

/** Flat fixture: 51-less — 2 masters + 11 screens with all refs. */
function flatFixturePen(): PenFile {
  return parsePenJson(
    JSON.stringify({
      version: '2.14',
      children: [
        masterFrame('m1', 'design', 'Button', {
          children: [
            { type: 'text', id: 't1', name: 'Label', content: 'Button' },
          ],
        }),
        masterFrame('m2', 'design', 'Badge'),
        frame('s1', 'Screen: Component Gallery', {
          children: [
            { type: 'text', id: 't2', name: 'Title', content: 'Gallery' },
          ],
        }),
        frame('s2', 'Screen: Settings Form'),
        frame('s3', 'Admin: Staff Users'),
        frame('s4', 'Admin: Health'),
        frame('s5', 'Admin: Recordings'),
        frame('s6', 'Admin: State: Empty'),
        frame('s7', 'Admin: State: Loading'),
        frame('s8', 'Admin: State: Error'),
      ],
      variables: { 'color-info': { type: 'color', value: [] } },
    })
  )
}

function groupsOf(pen: PenFile): PenNode[] {
  return pen.children.filter(child => child.type === 'group')
}

describe('REP-1622 group migration', () => {
  it('groups masters under masters/<pkg>/ and screens under screens/<surface>/<family>/', () => {
    const migrated = migratePenGroups(flatFixturePen())
    const groups = groupsOf(migrated)
    assert.deepEqual(groups.map(g => g.name).sort(), ['masters', 'screens'])

    const mastersGroup = groups.find(g => g.name === 'masters')!
    const designGroup = mastersGroup.children!.find(c => c.name === 'design')!
    assert.deepEqual(designGroup.children!.map(c => c.name).sort(), [
      'Badge',
      'Button',
    ])

    const screensGroup = groups.find(g => g.name === 'screens')!
    const adminGroup = screensGroup.children!.find(c => c.name === 'admin')!
    assert.deepEqual(adminGroup.children!.map(c => c.name).sort(), [
      'health',
      'recordings',
      'staff-users',
    ])
    const healthGroup = adminGroup.children!.find(c => c.name === 'health')!
    assert.deepEqual(healthGroup.children!.map(c => c.name).sort(), [
      'Admin: Health',
      'Admin: State: Empty',
      'Admin: State: Error',
      'Admin: State: Loading',
    ])
    const demoGroup = screensGroup.children!.find(c => c.name === 'demo')!
    assert.deepEqual(demoGroup.children!.map(c => c.name).sort(), [
      'component-gallery',
      'settings-form',
    ])
  })

  it('assigns state-family metadata to every screen', () => {
    const migrated = migratePenGroups(flatFixturePen())
    const screens = extractScreens(migrated)
    const health = screens
      .filter(s => s.name.startsWith('Admin: State'))
      .map(s => ({ name: s.name, family: s.stateFamily, state: s.state }))
    assert.deepEqual(health, [
      {
        name: 'Admin: State: Empty',
        family: 'screens/admin/health',
        state: 'empty',
      },
      {
        name: 'Admin: State: Loading',
        family: 'screens/admin/health',
        state: 'loading',
      },
      {
        name: 'Admin: State: Error',
        family: 'screens/admin/health',
        state: 'error',
      },
    ])
    const content = screens.find(s => s.name === 'Admin: Health')!
    assert.equal(content.stateFamily, 'screens/admin/health')
    assert.equal(content.state, 'content')
    const gallery = screens.find(s => s.name === 'Screen: Component Gallery')!
    assert.equal(gallery.stateFamily, 'screens/demo/component-gallery')
    assert.equal(gallery.state, 'content')
  })

  it('produces deterministic UUIDv5 group ids (two runs -> identical ids)', () => {
    const first = migratePenGroups(flatFixturePen())
    const second = migratePenGroups(flatFixturePen())
    assert.equal(
      JSON.stringify(first),
      JSON.stringify(second),
      'idempotent + deterministic'
    )
    const designGroup = groupsOf(first)
      .find(g => g.name === 'masters')!
      .children!.find(c => c.name === 'design')!
    assert.equal(designGroup.id, uuidv5('masters/design'))
  })

  it('is a no-op on an already-grouped file', () => {
    const migrated = migratePenGroups(flatFixturePen())
    const again = migratePenGroups(migrated)
    assert.equal(JSON.stringify(migrated), JSON.stringify(again))
  })

  it('preserves every node id, ref, and variable ref', () => {
    const flat = flatFixturePen()
    const before = extractNodeIds(flat.children)
    const migrated = migratePenGroups(flat)
    const after = extractNodeIds(migrated.children)
    assert.deepEqual(after, before)
    // Variable refs survive untouched.
    const rawBefore = JSON.stringify(flat)
    const rawAfter = JSON.stringify(migrated)
    assert.equal(countRefs(rawBefore), countRefs(rawAfter))
  })

  it('--drop-stubs removes the state stubs instead of migrating them', () => {
    const migrated = migratePenGroups(flatFixturePen(), { dropStubs: true })
    const screens = extractScreens(migrated)
    assert.equal(
      screens.some(s => s.name.startsWith('Admin: State:')),
      false
    )
    const healthGroup = groupsOf(migrated)
      .find(g => g.name === 'screens')!
      .children!.find(c => c.name === 'admin')!
      .children!.find(c => c.name === 'health')!
    assert.deepEqual(
      healthGroup.children!.map(c => c.name),
      ['Admin: Health']
    )
  })

  it('masters keep their resolved metadata after migration', () => {
    const migrated = migratePenGroups(flatFixturePen())
    const masters = extractMasters(migrated)
    const button = masters.find(m => m.id === 'm1')!
    assert.deepEqual(button.metadata, {
      type: 'master',
      package: 'design',
      component: 'Button',
    })
    assert.equal(button.groupPath, 'masters/design')
  })
})

describe('REP-1622 migrate CLI arg parsing', () => {
  it('defaults to PEN_FILE when --pen-file is absent (never consumes args[0])', () => {
    // The historical bug: args[args.indexOf('--pen-file') + 1] read args[0]
    // (e.g. '--dry-run') when the flag was absent.
    assert.equal(resolvePenFileArg([]).penFile, PEN_FILE)
    assert.equal(resolvePenFileArg(['--dry-run']).penFile, PEN_FILE)
    assert.equal(
      resolvePenFileArg(['--dry-run', '--drop-stubs']).penFile,
      PEN_FILE
    )
  })

  it('consumes the value following --pen-file', () => {
    assert.equal(
      resolvePenFileArg(['--pen-file', 'other.pen']).penFile,
      'other.pen'
    )
    assert.equal(
      resolvePenFileArg([
        '--dry-run',
        '--pen-file',
        'other.pen',
        '--drop-stubs',
      ]).penFile,
      'other.pen'
    )
  })

  it('rejects --pen-file with a missing value or a flag as its value', () => {
    assert.match(resolvePenFileArg(['--pen-file']).error!, /requires a value/)
    assert.match(
      resolvePenFileArg(['--pen-file', '--dry-run']).error!,
      /requires a value/
    )
  })
})

describe('REP-1622 partial migration (mixed flat + group)', () => {
  it('moves flat frames into the existing group model instead of no-oping', () => {
    const pen = parsePenJson(
      JSON.stringify({
        version: '2.14',
        children: [
          group('masters', 'gExisting', [
            group('design', 'gDesign', [masterFrame('m1', 'design', 'Button')]),
          ]),
          masterFrame('m2', 'design', 'Badge'),
          frame('s1', 'Screen: Gallery'),
        ],
        variables: {},
      })
    )
    const migrated = migratePenGroups(pen)
    const masters = extractMasters(migrated)
    assert.deepEqual(masters.map(m => m.id).sort(), ['m1', 'm2'])
    const screens = extractScreens(migrated)
    assert.deepEqual(
      screens.map(s => s.id),
      ['s1']
    )
    assert.equal(
      migrated.children.filter(c => c.type === 'frame').length,
      0,
      'no top-level flat frames remain after migration'
    )
    // Pre-existing group ids are preserved (merge into, not rebuild).
    const mastersGroup = migrated.children.find(
      c => c.type === 'group' && c.name === 'masters'
    ) as PenNode
    assert.equal(mastersGroup.id, 'gExisting')
  })
})

describe('REP-1622 screen classification', () => {
  it('maps name prefixes to surface and family', () => {
    assert.deepEqual(classifyScreen('Admin: Staff Users'), {
      surface: 'admin',
      family: 'staff-users',
      state: 'content',
    })
    assert.deepEqual(classifyScreen('Screen: Settings Form'), {
      surface: 'demo',
      family: 'settings-form',
      state: 'content',
    })
  })

  it('maps the state stubs into the health family with closed-enum states', () => {
    assert.deepEqual(classifyScreen('Admin: State: Empty'), {
      surface: 'admin',
      family: 'health',
      state: 'empty',
    })
    assert.deepEqual(classifyScreen('Admin: State: Loading'), {
      surface: 'admin',
      family: 'health',
      state: 'loading',
    })
    assert.deepEqual(classifyScreen('Admin: State: Error'), {
      surface: 'admin',
      family: 'health',
      state: 'error',
    })
  })
})

describe('REP-1622 real repro.pen migration (post-migration)', () => {
  it('produces the expected group structure and ref count', () => {
    const pen = parsePenJson(
      readFileSync(path.join(repoRoot, 'repro.pen'), 'utf8')
    )
    const groups = groupsOf(pen)
    assert.deepEqual(groups.map(g => g.name).sort(), ['masters', 'screens'])
    const masters = extractMasters(pen)
    const screens = extractScreens(pen)
    assert.equal(masters.length, 51)
    assert.equal(screens.length, 11)
    // Deterministic group ids are stable across runs.
    const mastersGroup = groups.find(g => g.name === 'masters')!
    assert.equal(mastersGroup.id, uuidv5('masters'))
    const designGroup = mastersGroup.children!.find(c => c.name === 'design')!
    assert.equal(designGroup.id, uuidv5('masters/design'))
  })
})

function extractNodeIds(nodes: PenNode[]): string[] {
  const ids: string[] = []
  const visit = (node: PenNode): void => {
    if (node.type !== 'group') ids.push(node.id)
    if (Array.isArray(node.children))
      for (const child of node.children) visit(child)
  }
  for (const node of nodes) visit(node)
  return ids.sort()
}

function countRefs(raw: string): number {
  return (raw.match(/\$[a-zA-Z0-9-]+/g) ?? []).length
}
