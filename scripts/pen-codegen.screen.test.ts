import assert from 'node:assert/strict'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { before, describe, it } from 'node:test'

import {
  fixturePen,
  frame,
  makeCtx,
  refNode,
  repoRoot,
  syntheticExports,
  textNode,
  tmpDir,
  writeCleanFixturePen,
  writeFixturePen,
} from './pen-codegen.test-helpers.ts'
import {
  generateScreenCode,
  runCodegen,
  sanitizeFileName,
  screenComponentName,
  type CodegenViolation,
  type RenderContext,
} from './pen-codegen.ts'
import type { PenFile, PenNode } from './pen-lint.ts'
import {
  collectAllPackageExports,
  extractMasters,
  parsePenJson,
} from './pen-lint.ts'

describe('REP-1622 screen code generation', () => {
  it('produces a deterministic component with sorted imports and props', () => {
    const pen = fixturePen()
    const ctx = makeCtx(pen)
    const generated = generateScreenCode(
      pen,
      {
        id: 's1',
        name: 'Screen: Demo',
        normalizedName: 'Demo',
      },
      ctx
    )
    assert.equal(generated.componentName, 'DemoScreen')
    assert.equal(ctx.violations.length, 1)
    assert.ok(
      generated.code.includes("import { Block } from '@jsxstyle/react'")
    )
    assert.ok(
      generated.code.includes("import { Button, Input } from '@repro/design'")
    )
    assert.ok(generated.code.includes('export const DemoScreen = () => {'))
    assert.ok(generated.code.includes('<Button>'))
    assert.ok(
      generated.code.includes(
        '<Input placeholder={"you@example.com"} width={300} />'
      )
    )
  })

  it('renders a replaced subtree inside a ref as children', () => {
    const pen = parsePenJson(
      JSON.stringify({
        version: '2.14',
        children: [
          frame('appMaster', 'design::EmptyState', {
            reusable: true,
            children: [
              textNode('esTitle', 'Title', 'Title'),
              frame('esBody', 'Body Slot', { children: [] }),
            ],
          }),
          frame('s1', 'Screen: Demo', {
            children: [
              refNode('r1', 'appMaster', 'EmptyState', {
                descendants: {
                  esTitle: { content: 'Nothing here' },
                  esBody: {
                    children: [
                      frame('inner', 'Inner', {
                        layout: 'vertical',
                        children: [textNode('t1', 'Label', 'Extra')],
                      }),
                    ],
                  },
                },
              }),
            ],
          }),
        ],
        variables: {},
      })
    )
    const ctx = makeCtx(pen)
    const generated = generateScreenCode(
      pen,
      {
        id: 's1',
        name: 'Screen: Demo',
        normalizedName: 'Demo',
      },
      ctx
    )
    assert.ok(generated.code.includes('<EmptyState title={"Nothing here"}>'))
    assert.ok(generated.code.includes('<Col>'))
    assert.ok(generated.code.includes('{"Extra"}'))
    assert.deepEqual(ctx.violations, [])
  })

  it('names components from normalized screen names', () => {
    assert.equal(screenComponentName('Settings Form'), 'SettingsFormScreen')
    assert.equal(
      screenComponentName('Admin: Staff Users'),
      'AdminStaffUsersScreen'
    )
    assert.equal(
      screenComponentName('Component Gallery'),
      'ComponentGalleryScreen'
    )
    assert.equal(sanitizeFileName('Admin: Staff Users'), 'admin-staff-users')
  })

  it('falls back to unnamed-screen when the name sanitizes to nothing', () => {
    assert.equal(sanitizeFileName('!!!###'), 'unnamed-screen')
    assert.equal(sanitizeFileName('@#$%^&*()'), 'unnamed-screen')
  })

  it('omits the design import when no design token is referenced', () => {
    const pen = parsePenJson(
      JSON.stringify({
        version: '2.14',
        children: [
          frame('s1', 'Screen: Plain', {
            children: [textNode('t1', 'Label', 'Hello')],
          }),
        ],
        variables: {},
      })
    )
    const ctx = makeCtx(pen)
    const generated = generateScreenCode(
      pen,
      { id: 's1', name: 'Screen: Plain', normalizedName: 'Plain' },
      ctx
    )
    // Guard against emitting `import {  } from '@repro/design'`.
    assert.ok(!generated.code.includes('@repro/design'))
    // React is the first external import.
    assert.ok(
      generated.code.indexOf("import React from 'react'") <
        generated.code.indexOf('@jsxstyle/react')
    )
    assert.ok(
      generated.code.includes("import { Block } from '@jsxstyle/react'")
    )
  })
})

describe('REP-1622 real repro.pen integration (read-only)', () => {
  const realPenFile = path.join(repoRoot, 'repro.pen')
  let pen: PenFile | null = null
  let exportsByPackage: Map<string, Set<string>> = new Map()
  const masterNodeById = new Map<string, PenNode>()

  // Setup runs in `before` (not at module load) so an absent repro.pen
  // skips these tests instead of failing every test in the file.
  before(() => {
    if (!existsSync(realPenFile)) return
    pen = parsePenJson(readFileSync(realPenFile, 'utf8'))
    exportsByPackage = collectAllPackageExports(repoRoot)
    for (const master of extractMasters(pen)) {
      const node = pen.children.find(child => child.id === master.id)
      if (node) masterNodeById.set(master.id, node)
    }
  })

  const renderScreen = (screen: {
    id: string
    name: string
    normalizedName: string
  }): { ctx: RenderContext; code: string } => {
    if (!pen) throw new Error('repro.pen not present in this checkout')
    const ctx: RenderContext = {
      masterNodeById,
      exportsByPackage,
      violations: [],
      warnings: [],
      designImports: new Set(),
      jsxstyleImports: new Set(),
      screenId: screen.id,
      screenName: screen.name,
    }
    return { ctx, code: generateScreenCode(pen, screen, ctx).code }
  }

  it('generates every screen with zero violations', t => {
    if (!pen) return t.skip('repro.pen not present in this checkout')
    const screens = [
      {
        id: 'Ff1x2',
        name: 'Screen: Settings Form',
        normalizedName: 'Settings Form',
      },
      {
        id: 'T15Wa',
        name: 'Admin: Staff Users',
        normalizedName: 'Admin: Staff Users',
      },
      {
        id: 'HmP9z',
        name: 'Admin: Recordings',
        normalizedName: 'Admin: Recordings',
      },
    ]
    for (const screen of screens) {
      const { ctx, code } = renderScreen(screen)
      assert.deepEqual(
        ctx.violations,
        [],
        `${screen.name}: ${JSON.stringify(ctx.violations)}`
      )
      assert.ok(code.startsWith('// Generated by scripts/pen-codegen.ts'))
      assert.ok(
        code.includes(
          `export const ${screenComponentName(screen.normalizedName)} = () => {`
        )
      )
    }
  })

  it('produces byte-identical output on repeated generation (determinism)', t => {
    if (!pen) return t.skip('repro.pen not present in this checkout')
    const screen = {
      id: 'Ff1x2',
      name: 'Screen: Settings Form',
      normalizedName: 'Settings Form',
    }
    assert.equal(renderScreen(screen).code, renderScreen(screen).code)
  })
})

describe('REP-1622 CLI exit codes', () => {
  it('exits 0 and writes files for a clean pen file', () => {
    const penFile = writeCleanFixturePen()
    const outputDir = path.join(tmpDir, 'pen-codegen-cli-clean')
    rmSync(outputDir, { recursive: true, force: true })
    const logs: string[] = []
    let json = ''
    const code = runCodegen({
      penFile,
      outputDir,
      exportsByPackage: syntheticExports(),
      log: msg => logs.push(msg),
      jsonOut: j => {
        json = j
      },
    })
    assert.equal(code, 0, logs.join('\n'))
    const report = JSON.parse(json) as {
      clean: boolean
      output: Array<{ file: string }>
    }
    assert.equal(report.clean, true)
    assert.ok(report.output.length === 1)
    assert.ok(report.output[0]!.file.endsWith('screen-demo.tsx'))
  })

  it('exits 1 with a violation for an unmappable master', () => {
    const penFile = path.join(tmpDir, 'pen-codegen-bad.pen')
    mkdirSync(tmpDir, { recursive: true })
    writeFileSync(
      penFile,
      JSON.stringify(
        parsePenJson(
          JSON.stringify({
            version: '2.14',
            children: [
              frame('unknownMaster', 'Foo', { reusable: true }),
              frame('s1', 'Screen: Demo', {
                children: [refNode('r1', 'unknownMaster', 'Foo')],
              }),
            ],
            variables: {},
          })
        ),
        null,
        2
      ) + '\n'
    )
    const logs: string[] = []
    let json = ''
    const code = runCodegen({
      penFile,
      outputDir: path.join(tmpDir, 'pen-codegen-cli-bad'),
      exportsByPackage: syntheticExports(),
      log: msg => logs.push(msg),
      jsonOut: j => {
        json = j
      },
    })
    assert.equal(code, 1)
    const report = JSON.parse(json) as {
      clean: boolean
      violations: CodegenViolation[]
    }
    assert.equal(report.clean, false)
    assert.equal(report.violations.length, 1)
    assert.match(logs.join('\n'), /violation:/)
  })

  it('exits 1 when --screen matches nothing', () => {
    const penFile = writeFixturePen()
    const logs: string[] = []
    const code = runCodegen({
      penFile,
      screen: 'No Such Screen',
      dryRun: true,
      exportsByPackage: syntheticExports(),
      log: msg => logs.push(msg),
    })
    assert.equal(code, 1)
    assert.match(logs.join('\n'), /no screen matches/)
  })

  it('consumes a catalog for screens when --catalog is provided', () => {
    const penFile = writeCleanFixturePen()
    const catalogFile = path.join(tmpDir, 'pen-codegen-fixture-catalog.json')
    writeFileSync(
      catalogFile,
      JSON.stringify({
        masters: [],
        screens: [{ id: 's1', name: 'Screen: Demo', normalizedName: 'Demo' }],
        screensIndex: { Demo: 's1' },
        variables: {},
      })
    )
    const logs: string[] = []
    let json = ''
    const code = runCodegen({
      penFile,
      catalogOutput: catalogFile,
      dryRun: true,
      exportsByPackage: syntheticExports(),
      log: msg => logs.push(msg),
      jsonOut: j => {
        json = j
      },
    })
    assert.equal(code, 0, logs.join('\n'))
    const report = JSON.parse(json) as { screenCount: number }
    assert.equal(report.screenCount, 1)
  })
})
