import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'

import {
  fixturePen,
  frame,
  makeCtx,
  refNode,
  syntheticExports,
  textNode,
  tmpDir,
} from './pen-codegen.test-helpers.ts'
import {
  layoutTagFor,
  parseCliArgs,
  renderNode,
  resolveDescendantTarget,
  resolveMasterComponent,
  resolveVariableRef,
  runCodegen,
  type CodegenViolation,
} from './pen-codegen.ts'
import type { PenFile, PenNode } from './pen-lint.ts'
import { extractMasters, parsePenJson } from './pen-lint.ts'

describe('REP-1622 variable resolution', () => {
  /** Narrow resolveVariableRef to just the resolved code for assertions. */
  const code = (ref: string): string => {
    const result = resolveVariableRef(ref)
    return result.ok ? result.code : ''
  }

  it('maps $-refs to deterministic design-token expressions', () => {
    assert.deepEqual(resolveVariableRef('color-info'), {
      ok: true,
      code: 'color.info',
      token: 'color',
    })
    assert.deepEqual(resolveVariableRef('color-text-default'), {
      ok: true,
      code: 'color.text.default',
      token: 'color',
    })
    assert.deepEqual(resolveVariableRef('color-bg-surface'), {
      ok: true,
      code: 'color.bg.surface',
      token: 'color',
    })
  })

  it('uses bracket notation for token keys that start with digits', () => {
    assert.equal(code('spacing-2xl'), "spacing['2xl']")
    assert.equal(code('font-size-2xl'), "fontSize['2xl']")
  })

  it('resolves typography and form-control prefixes', () => {
    assert.equal(code('font-size-sm'), 'fontSize.sm')
    assert.equal(code('font-sans'), 'fontFamily.sans')
    assert.equal(code('radius-md'), 'radius.md')
    assert.equal(code('shadow-md'), 'shadow.md')
    assert.equal(code('form-height-md'), 'formControlHeight.medium')
  })

  it('falls back to a raw string with a warning for unknown prefixes', () => {
    const warnings: string[] = []
    const result = resolveVariableRef('made-up-token', warnings)
    assert.equal(result.ok, false)
    assert.equal(warnings.length, 1)
    assert.match(warnings[0]!, /made-up-token/)
  })
})

describe('REP-1622 master resolution', () => {
  const exportsByPackage = syntheticExports()

  it('resolves a conforming package::ComponentName master exactly', () => {
    assert.deepEqual(
      resolveMasterComponent('design::Button', exportsByPackage),
      { ok: true, pkg: 'design', comp: 'Button' }
    )
  })

  it('infers a single exact candidate for an unprefixed master', () => {
    assert.deepEqual(resolveMasterComponent('Button', exportsByPackage), {
      ok: true,
      pkg: 'design',
      comp: 'Button',
    })
  })

  it('reports ambiguous masters with candidate list', () => {
    const result = resolveMasterComponent('EmptyState', exportsByPackage)
    assert.equal(result.ok, false)
    assert.deepEqual(result.candidates, [
      'agentic-ui::EmptyState',
      'design::EmptyState',
    ])
  })

  it('reports an unresolvable master as a failure', () => {
    const result = resolveMasterComponent('Foo', exportsByPackage)
    assert.equal(result.ok, false)
    assert.ok(Array.isArray(result.candidates))
  })

  it('never auto-resolves when the explicit package lacks the export', () => {
    // design::EmptyState names the design package explicitly, but design does
    // not export EmptyState — agentic-ui does. The explicit namespace must win:
    // report the candidate, do not silently resolve to agentic-ui.
    const exports = new Map<string, Set<string>>([
      ['design', new Set(['Button', 'Input'])],
      ['agentic-ui', new Set(['EmptyState'])],
    ])
    const result = resolveMasterComponent('design::EmptyState', exports)
    assert.equal(result.ok, false)
    assert.deepEqual(result.candidates, ['agentic-ui::EmptyState'])
  })
})

describe('REP-1622 layout heuristic', () => {
  it('maps pen layout to jsxstyle primitives', () => {
    assert.equal(layoutTagFor(frame('f1', 'x', { layout: 'vertical' })), 'Col')
    assert.equal(layoutTagFor(frame('f2', 'x', { layout: 'grid' })), 'Grid')
    assert.equal(
      layoutTagFor(frame('f3', 'x', { layout: 'horizontal' })),
      'Row'
    )
    assert.equal(layoutTagFor(frame('f4', 'x', { layout: 'none' })), 'Block')
    assert.equal(layoutTagFor(frame('f5', 'x', {})), 'Block')
  })

  it('renders a frame as a jsxstyle primitive with resolved props', () => {
    const ctx = makeCtx(fixturePen())
    const node = frame('f1', 'Header', {
      layout: 'vertical',
      gap: '$spacing-md',
      padding: ['$spacing-md', 16],
      children: [],
    })
    const out = renderNode(node, 0, ctx)!
    assert.match(
      out,
      /<Col gap=\{spacing\.md\} padding=\{\[spacing\.md, 16\]\} \/>/
    )
    assert.ok(ctx.jsxstyleImports.has('Col'))
    assert.ok(ctx.designImports.has('spacing'))
  })

  it('renders a null layout prop as the JS null literal', () => {
    const ctx = makeCtx(fixturePen())
    const node = frame('f1', 'Header', {
      layout: 'vertical',
      padding: null,
    })
    const out = renderNode(node, 0, ctx)!
    assert.ok(out.includes('padding={null}'))
  })
})

describe('REP-1622 text node translation', () => {
  it('renders styled text with a textStyles preset when font props match', () => {
    const ctx = makeCtx(fixturePen())
    const node = textNode('t1', 'Title', 'Hello')
    Object.assign(node, {
      fill: '$color-text-default',
      fontFamily: '$font-sans',
      fontSize: '$font-size-2xl',
      fontWeight: '700',
      lineHeight: 1.25,
    })
    const out = renderNode(node, 0, ctx)!
    // The textStyles spread comes first so explicit props (color, component)
    // are the final authority rather than being overridden by the spread.
    assert.match(
      out,
      /<Block \{\.\.\.textStyles\.heading1\} color=\{color\.text\.default\} component="p">/
    )
    assert.match(out, /\{"Hello"\}/)
    assert.ok(ctx.designImports.has('textStyles'))
  })

  it('places the textStyles spread before explicit props in output order', () => {
    const ctx = makeCtx(fixturePen())
    const node = textNode('t5', 'Title', 'Hello')
    Object.assign(node, {
      fill: '$color-text-default',
      fontFamily: '$font-sans',
      fontSize: '$font-size-2xl',
      fontWeight: '700',
      lineHeight: 1.25,
    })
    const out = renderNode(node, 0, ctx)!
    const spreadIndex = out.indexOf('{...textStyles.heading1}')
    const colorIndex = out.indexOf('color={')
    const componentIndex = out.indexOf('component="p"')
    assert.ok(spreadIndex >= 0, 'spread should be present')
    assert.ok(
      spreadIndex < colorIndex && spreadIndex < componentIndex,
      `spread (${spreadIndex}) must come before color (${colorIndex}) and component (${componentIndex}):\n${out}`
    )
  })

  it('emits individual font props when no preset matches', () => {
    const ctx = makeCtx(fixturePen())
    const node = textNode('t2', 'Body', 'Hi')
    Object.assign(node, {
      fill: '$color-text-secondary',
      fontFamily: '$font-sans',
      fontSize: '$font-size-sm',
      fontWeight: 'normal',
      lineHeight: 1.25, // fontSize.sm + normal + lineHeight.normal is not a defined textStyles preset
    })
    const out = renderNode(node, 0, ctx)!
    assert.match(out, /fontFamily=\{fontFamily\.sans\}/)
    assert.match(out, /fontSize=\{fontSize\.sm\}/)
    assert.match(out, /fontWeight=\{fontWeight\.normal\}/)
    assert.match(out, /lineHeight=\{lineHeight\.normal\}/)
    assert.doesNotMatch(out, /textStyles/)
  })

  it('emits a raw color prop for non-token fill values', () => {
    const ctx = makeCtx(fixturePen())
    const node = textNode('t3', 'Badge', 'New')
    Object.assign(node, { fill: '#FF0000' })
    const out = renderNode(node, 0, ctx)!
    assert.match(out, /color=\{"#FF0000"\}/)
    assert.match(out, /component="p"/)
    assert.deepEqual(ctx.warnings, [])
  })

  it('maps thin/extraLight/extraBold/black numeric weights to tokens', () => {
    const cases: Array<[string, string]> = [
      ['100', 'fontWeight.thin'],
      ['200', 'fontWeight.extraLight'],
      ['800', 'fontWeight.extraBold'],
      ['900', 'fontWeight.black'],
    ]
    for (const [weight, expected] of cases) {
      const ctx = makeCtx(fixturePen())
      const node = textNode('t4', 'Label', 'X')
      Object.assign(node, { fontWeight: weight })
      const out = renderNode(node, 0, ctx)!
      assert.ok(
        out.includes(`fontWeight={${expected}}`),
        `weight ${weight} should render ${expected}, got:\n${out}`
      )
    }
  })
})

describe('REP-1622 ref node translation', () => {
  it('maps a Label text override to component children', () => {
    const ctx = makeCtx(fixturePen())
    const node = refNode('r1', 'btnMaster', 'Save', {
      descendants: { btnLabel: { content: 'Save changes' } },
    })
    const out = renderNode(node, 0, ctx)!
    assert.equal(out, '<Button>\n  {"Save changes"}\n</Button>')
    assert.ok(ctx.designImports.has('Button'))
    assert.deepEqual(ctx.violations, [])
  })

  it('maps a Placeholder text override to the placeholder prop', () => {
    const ctx = makeCtx(fixturePen())
    const node = refNode('r2', 'inputMaster', 'Email', {
      width: 300,
      descendants: { inputPlaceholder: { content: 'you@example.com' } },
    })
    const out = renderNode(node, 0, ctx)!
    assert.equal(out, '<Input placeholder={"you@example.com"} width={300} />')
  })

  it('reports an unresolvable master as a violation', () => {
    const ctx = makeCtx(fixturePen())
    const node = refNode('r3', 'unknownMaster', 'Foo')
    const out = renderNode(node, 0, ctx)
    assert.equal(out, null)
    assert.equal(ctx.violations.length, 1)
    assert.equal(ctx.violations[0]!.refId, 'r3')
    assert.match(ctx.violations[0]!.reason, /Foo/)
  })
})

describe('REP-1622 descendant override resolution', () => {
  const nestedPen = (): PenFile =>
    parsePenJson(
      JSON.stringify({
        version: '2.14',
        children: [
          frame('iconMaster', 'design::Icon', {
            reusable: true,
            children: [textNode('iconLabel', 'Label', 'x')],
          }),
          frame('cardMaster', 'design::Card', {
            reusable: true,
            children: [refNode('cardIcon', 'iconMaster', 'Icon')],
          }),
        ],
        variables: {},
      })
    )

  const mastersById = (pen: PenFile): Map<string, PenNode> => {
    const map = new Map<string, PenNode>()
    for (const master of extractMasters(pen)) {
      const node = pen.children.find(child => child.id === master.id)
      if (node) map.set(master.id, node)
    }
    return map
  }

  it('resolves a two-level ref path to a descendant node', () => {
    const byId = mastersById(nestedPen())
    assert.deepEqual(
      resolveDescendantTarget(
        byId.get('cardMaster')!,
        'cardIcon/iconLabel',
        byId
      ),
      { type: 'text', name: 'Label' }
    )
  })

  it('returns null when the first key segment is not a ref node', () => {
    const pen = parsePenJson(
      JSON.stringify({
        version: '2.14',
        children: [
          frame('iconMaster', 'design::Icon', {
            reusable: true,
            children: [textNode('iconLabel', 'Label', 'x')],
          }),
          frame('cardMaster', 'design::Card', {
            reusable: true,
            children: [textNode('cardText', 'Label', 'x')],
          }),
        ],
        variables: {},
      })
    )
    const byId = mastersById(pen)
    assert.equal(
      resolveDescendantTarget(
        byId.get('cardMaster')!,
        'cardText/iconLabel',
        byId
      ),
      null
    )
  })

  it('returns null when the nested child id does not exist', () => {
    const byId = mastersById(nestedPen())
    assert.equal(
      resolveDescendantTarget(byId.get('cardMaster')!, 'cardIcon/nope', byId),
      null
    )
  })

  it('warns when a descendant path has more than two segments', () => {
    const warnings: string[] = []
    const byId = mastersById(nestedPen())
    const result = resolveDescendantTarget(
      byId.get('cardMaster')!,
      'cardIcon/iconLabel/nope',
      byId,
      warnings
    )
    assert.equal(result, null)
    assert.equal(warnings.length, 1)
    assert.match(warnings[0]!, /not supported in v1/)
  })
})

describe('REP-1622 CLI argument parsing', () => {
  it('parses --screen with a following value', () => {
    const { options, error } = parseCliArgs(['--screen', 'Demo'])
    assert.equal(error, undefined)
    assert.equal(options.screen, 'Demo')
  })

  it('reports a usage error when --screen is the final argument', () => {
    const { options, error } = parseCliArgs(['--dry-run', '--screen'])
    assert.equal(options.screen, undefined)
    assert.match(error!, /--screen requires a value/)
  })

  it('parses dry-run and pen-file flags', () => {
    const { options, error } = parseCliArgs([
      '--pen-file',
      'fixture.pen',
      '--dry-run',
    ])
    assert.equal(error, undefined)
    assert.equal(options.penFile, 'fixture.pen')
    assert.equal(options.dryRun, true)
  })

  it('rejects a flag name used as a --screen value', () => {
    const { options, error } = parseCliArgs(['--screen', '--dry-run'])
    assert.equal(options.screen, undefined)
    assert.match(error!, /looks like another flag/)
  })

  it('rejects flag names used as values for pen-file, output, and catalog', () => {
    const penFile = parseCliArgs(['--pen-file', '--output', 'x'])
    assert.equal(penFile.options.penFile, undefined)
    assert.match(penFile.error!, /looks like another flag/)

    const output = parseCliArgs(['--output', '--screen'])
    assert.equal(output.options.outputDir, undefined)
    assert.match(output.error!, /looks like another flag/)

    const catalog = parseCliArgs(['--catalog', '--dry-run'])
    assert.equal(catalog.options.catalogOutput, undefined)
    assert.match(catalog.error!, /looks like another flag/)
  })

  it('reports a missing value for every value-taking flag', () => {
    for (const flag of ['--screen', '--pen-file', '--output', '--catalog']) {
      const { error } = parseCliArgs([flag])
      assert.ok(error, `${flag} should report a missing value`)
    }
  })
})

describe('REP-1622 output filename collisions', () => {
  it('reports a violation when two screens sanitize to the same filename', () => {
    const penFile = path.join(tmpDir, 'pen-codegen-collision.pen')
    mkdirSync(tmpDir, { recursive: true })
    writeFileSync(
      penFile,
      JSON.stringify(
        parsePenJson(
          JSON.stringify({
            version: '2.14',
            children: [
              frame('btnMaster', 'design::Button', {
                reusable: true,
                children: [textNode('btnLabel', 'Label', 'Label')],
              }),
              frame('s1', 'Screen: Demo', {
                children: [
                  refNode('r1', 'btnMaster', 'Save', {
                    descendants: { btnLabel: { content: 'A' } },
                  }),
                ],
              }),
              // "screen demo" sanitizes to the same file as "Screen: Demo".
              frame('s2', 'screen demo', {
                children: [
                  refNode('r2', 'btnMaster', 'Save', {
                    descendants: { btnLabel: { content: 'B' } },
                  }),
                ],
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
      outputDir: path.join(tmpDir, 'pen-codegen-cli-collision'),
      exportsByPackage: syntheticExports(),
      log: msg => logs.push(msg),
      jsonOut: j => {
        json = j
      },
    })
    assert.equal(code, 1)
    const report = JSON.parse(json) as {
      clean: boolean
      output: Array<{ file: string }>
      violations: CodegenViolation[]
    }
    assert.equal(report.clean, false)
    assert.equal(report.violations.length, 1)
    assert.match(report.violations[0]!.reason, /collides/)
    // The first screen wins; the colliding screen is not written.
    assert.equal(report.output.length, 1)
  })
})
