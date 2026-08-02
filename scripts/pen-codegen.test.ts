import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  fixturePen,
  frame,
  makeCtx,
  refNode,
  syntheticExports,
  textNode,
} from './pen-codegen.test-helpers.ts'
import {
  layoutTagFor,
  renderNode,
  resolveMasterComponent,
  resolveVariableRef,
} from './pen-codegen.ts'

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
    assert.match(
      out,
      /<Block color=\{color\.text\.default\} component="p" \{\.\.\.textStyles\.heading1\}>/
    )
    assert.match(out, /\{"Hello"\}/)
    assert.ok(ctx.designImports.has('textStyles'))
  })

  it('emits individual font props when no preset matches', () => {
    const ctx = makeCtx(fixturePen())
    const node = textNode('t2', 'Body', 'Hi')
    Object.assign(node, {
      fill: '$color-text-secondary',
      fontFamily: '$font-sans',
      fontSize: '$font-size-sm',
      fontWeight: 'normal',
      lineHeight: 1.25, // tight-ish line height matches no textStyles preset
    })
    const out = renderNode(node, 0, ctx)!
    assert.match(out, /fontFamily=\{fontFamily\.sans\}/)
    assert.match(out, /fontSize=\{fontSize\.sm\}/)
    assert.match(out, /fontWeight=\{fontWeight\.normal\}/)
    assert.match(out, /lineHeight=\{lineHeight\.normal\}/)
    assert.doesNotMatch(out, /textStyles/)
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
