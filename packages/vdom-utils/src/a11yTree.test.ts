import { NodeType, VTree } from '@repro/domain'
import { Box } from '@repro/tdl'
import assert from 'node:assert'
import { describe, it } from 'node:test'
import { A11yNode, buildA11yTree, formatA11yTree } from './a11yTree'

function makeElement(
  id: string,
  tagName: string,
  children: string[] = [],
  attributes: Record<string, string> = {},
  properties: { value?: string | null; checked?: boolean | null } = {}
) {
  return new Box({
    type: NodeType.Element as NodeType.Element,
    id,
    parentId: null,
    tagName,
    children,
    attributes,
    properties: {
      value: properties.value ?? null,
      checked: properties.checked ?? null,
      selectedIndex: null,
    },
    shadowRoot: false,
  })
}

function makeText(id: string, value: string) {
  return new Box({
    type: NodeType.Text as NodeType.Text,
    id,
    parentId: null,
    value,
  })
}

function makeDocument(id: string, children: string[]) {
  return new Box({
    type: NodeType.Document as NodeType.Document,
    id,
    parentId: null,
    children,
  })
}

function makeVTree(
  nodes: Record<
    string,
    ReturnType<typeof makeElement | typeof makeText | typeof makeDocument>
  >,
  rootId: string = 'root'
): VTree {
  return { rootId, nodes } as VTree
}

describe('buildA11yTree', () => {
  it('returns root node for empty document', () => {
    const vtree = makeVTree({
      root: makeDocument('root', []),
    })
    const result = buildA11yTree(vtree)
    assert.ok(result !== null)
    assert.strictEqual(result.role, 'root')
    assert.deepStrictEqual(result.children, [])
  })

  it('builds a11y node for button element', () => {
    const vtree = makeVTree({
      root: makeDocument('root', ['btn']),
      btn: makeElement('btn', 'button', [], { 'aria-label': 'Submit' }),
    })
    const result = buildA11yTree(vtree)
    assert.ok(result !== null)
    assert.strictEqual(result.children.length, 1)
    assert.strictEqual(result.children[0]!.role, 'button')
    assert.strictEqual(result.children[0]!.name, 'Submit')
  })

  it('uses explicit role attribute over implicit', () => {
    const vtree = makeVTree({
      root: makeDocument('root', ['el']),
      el: makeElement('el', 'div', [], { role: 'banner' }),
    })
    const result = buildA11yTree(vtree)
    assert.ok(result !== null)
    assert.strictEqual(result.children.length, 1)
    assert.strictEqual(result.children[0]!.role, 'banner')
  })

  it('computes accessible name from aria-label', () => {
    const vtree = makeVTree({
      root: makeDocument('root', ['nav']),
      nav: makeElement('nav', 'nav', [], { 'aria-label': 'Main navigation' }),
    })
    const result = buildA11yTree(vtree)
    assert.ok(result !== null)
    assert.strictEqual(result.children[0]!.name, 'Main navigation')
  })

  it('computes accessible name from child text for buttons', () => {
    const vtree = makeVTree({
      root: makeDocument('root', ['btn']),
      btn: makeElement('btn', 'button', ['txt']),
      txt: makeText('txt', 'Click me'),
    })
    const result = buildA11yTree(vtree)
    assert.ok(result !== null)
    assert.strictEqual(result.children[0]!.name, 'Click me')
  })

  it('skips script elements', () => {
    const vtree = makeVTree({
      root: makeDocument('root', ['s1', 'btn']),
      s1: makeElement('s1', 'script', []),
      btn: makeElement('btn', 'button', [], { 'aria-label': 'Go' }),
    })
    const result = buildA11yTree(vtree)
    assert.ok(result !== null)
    assert.strictEqual(result.children.length, 1)
    assert.strictEqual(result.children[0]!.role, 'button')
  })

  it('skips style elements', () => {
    const vtree = makeVTree({
      root: makeDocument('root', ['s1', 'nav']),
      s1: makeElement('s1', 'style', []),
      nav: makeElement('nav', 'nav', []),
    })
    const result = buildA11yTree(vtree)
    assert.ok(result !== null)
    assert.strictEqual(result.children.length, 1)
    assert.strictEqual(result.children[0]!.role, 'navigation')
  })

  it('skips aria-hidden elements', () => {
    const vtree = makeVTree({
      root: makeDocument('root', ['hidden', 'btn']),
      hidden: makeElement('hidden', 'div', [], {
        'aria-hidden': 'true',
        role: 'complementary',
      }),
      btn: makeElement('btn', 'button', [], { 'aria-label': 'Go' }),
    })
    const result = buildA11yTree(vtree)
    assert.ok(result !== null)
    assert.strictEqual(result.children.length, 1)
    assert.strictEqual(result.children[0]!.role, 'button')
  })

  it('hoists children of transparent elements (div/span)', () => {
    const vtree = makeVTree({
      root: makeDocument('root', ['wrapper']),
      wrapper: makeElement('wrapper', 'div', ['btn']),
      btn: makeElement('btn', 'button', [], { 'aria-label': 'Go' }),
    })
    const result = buildA11yTree(vtree)
    assert.ok(result !== null)
    assert.strictEqual(result.children.length, 1)
    assert.strictEqual(result.children[0]!.role, 'button')
  })

  it('maps input type to correct role', () => {
    const vtree = makeVTree({
      root: makeDocument('root', ['cb']),
      cb: makeElement('cb', 'input', [], { type: 'checkbox' }),
    })
    const result = buildA11yTree(vtree)
    assert.ok(result !== null)
    assert.strictEqual(result.children[0]!.role, 'checkbox')
  })

  it('maps input type=submit to button role', () => {
    const vtree = makeVTree({
      root: makeDocument('root', ['btn']),
      btn: makeElement('btn', 'input', [], { type: 'submit' }),
    })
    const result = buildA11yTree(vtree)
    assert.ok(result !== null)
    assert.strictEqual(result.children[0]!.role, 'button')
  })

  it('defaults input with no type to textbox role', () => {
    const vtree = makeVTree({
      root: makeDocument('root', ['inp']),
      inp: makeElement('inp', 'input', []),
    })
    const result = buildA11yTree(vtree)
    assert.ok(result !== null)
    assert.strictEqual(result.children[0]!.role, 'textbox')
  })

  it('includes state for disabled elements', () => {
    const vtree = makeVTree({
      root: makeDocument('root', ['btn']),
      btn: makeElement('btn', 'button', [], {
        disabled: '',
        'aria-label': 'Submit',
      }),
    })
    const result = buildA11yTree(vtree)
    assert.ok(result !== null)
    const btn = result.children[0]!
    assert.deepStrictEqual(btn.state, { disabled: true })
  })

  it('includes state for checked elements', () => {
    const vtree = makeVTree({
      root: makeDocument('root', ['cb']),
      cb: makeElement('cb', 'input', [], {
        type: 'checkbox',
        'aria-checked': 'true',
      }),
    })
    const result = buildA11yTree(vtree)
    assert.ok(result !== null)
    const cb = result.children[0]!
    assert.deepStrictEqual(cb.state, { checked: 'true' })
  })

  it('handles nested structure nav > ul > li > a', () => {
    const vtree = makeVTree({
      root: makeDocument('root', ['nav']),
      nav: makeElement('nav', 'nav', ['ul'], { 'aria-label': 'Main' }),
      ul: makeElement('ul', 'ul', ['li1', 'li2']),
      li1: makeElement('li1', 'li', ['a1']),
      li2: makeElement('li2', 'li', ['a2']),
      a1: makeElement('a1', 'a', ['t1'], { href: '#' }),
      a2: makeElement('a2', 'a', ['t2'], { href: '#' }),
      t1: makeText('t1', 'Home'),
      t2: makeText('t2', 'About'),
    })
    const result = buildA11yTree(vtree)
    assert.ok(result !== null)
    assert.strictEqual(result.children.length, 1)
    const nav = result.children[0]!
    assert.strictEqual(nav.role, 'navigation')
    assert.strictEqual(nav.name, 'Main')
    assert.strictEqual(nav.children.length, 1)
    const list = nav.children[0]!
    assert.strictEqual(list.role, 'list')
    assert.strictEqual(list.children.length, 2)
    const item1 = list.children[0]!
    assert.strictEqual(item1.role, 'listitem')
    const link1 = item1.children[0]!
    assert.strictEqual(link1.role, 'link')
    assert.strictEqual(link1.name, 'Home')
  })
})

describe('formatA11yTree', () => {
  it('formats tree as indented text', () => {
    const tree: A11yNode = {
      role: 'root',
      name: '',
      children: [
        {
          role: 'navigation',
          name: 'Main',
          children: [{ role: 'link', name: 'Home', children: [] }],
        },
      ],
    }
    const result = formatA11yTree(tree)
    assert.ok(result.includes('root'))
    assert.ok(result.includes('  navigation "Main"'))
    assert.ok(result.includes('    link "Home"'))
  })

  it('omits name quotes when name is empty', () => {
    const tree: A11yNode = {
      role: 'main',
      name: '',
      children: [],
    }
    const result = formatA11yTree(tree)
    assert.ok(result.includes('main'))
    assert.ok(!result.includes('main ""'))
  })

  it('includes state in formatted output', () => {
    const tree: A11yNode = {
      role: 'button',
      name: 'Submit',
      children: [],
      state: { disabled: true },
    }
    const result = formatA11yTree(tree)
    assert.ok(result.includes('button "Submit"'))
    assert.ok(result.includes('disabled'))
  })

  it('includes value in formatted output', () => {
    const tree: A11yNode = {
      role: 'textbox',
      name: 'Email',
      children: [],
      value: 'user@example.com',
    }
    const result = formatA11yTree(tree)
    assert.ok(result.includes('textbox "Email"'))
    assert.ok(result.includes('user@example.com'))
  })

  it('respects maxDepth limit', () => {
    const makeDeep = (depth: number): A11yNode => ({
      role: 'listitem',
      name: `depth-${depth}`,
      children: depth > 0 ? [makeDeep(depth - 1)] : [],
    })

    const tree: A11yNode = {
      role: 'root',
      name: '',
      children: [makeDeep(5)],
    }

    const result = formatA11yTree(tree, 2)
    assert.ok(result.includes('depth-5'))
    assert.ok(!result.includes('depth-3'))
  })
})

// ─── Change 2: nodeId annotations ─────────────────────────────────────────────

describe('buildA11yTree — nodeId population', () => {
  it('populates nodeId on nodes that have a role', () => {
    const vtree = makeVTree({
      root: makeDocument('root', ['btn']),
      btn: makeElement('btn', 'button', [], { 'aria-label': 'Click me' }),
    })
    const result = buildA11yTree(vtree)
    assert.ok(result !== null)
    const btn = result.children[0]!
    assert.strictEqual(btn.role, 'button')
    assert.strictEqual(btn.nodeId, 'btn')
  })

  it('does not produce nodeId on transparent (no-role) elements that are flattened', () => {
    const vtree = makeVTree({
      root: makeDocument('root', ['wrapper']),
      wrapper: makeElement('wrapper', 'div', ['btn']),
      btn: makeElement('btn', 'button', [], { 'aria-label': 'Go' }),
    })
    const result = buildA11yTree(vtree)
    assert.ok(result !== null)
    // wrapper div has no role so it's flattened; btn is hoisted to root.children
    assert.strictEqual(result.children.length, 1)
    assert.strictEqual(result.children[0]!.nodeId, 'btn')
  })
})

describe('formatA11yTree — [ref=nodeId] annotations', () => {
  it('includes [ref=nodeId] in formatted output', () => {
    const tree: A11yNode = {
      role: 'button',
      name: 'Submit',
      nodeId: 'btn-1',
      children: [],
    }
    const result = formatA11yTree(tree)
    assert.ok(
      result.includes('[ref=btn-1]'),
      `Expected [ref=btn-1] in: ${result}`
    )
  })

  it('does not include [ref=...] when nodeId is absent', () => {
    const tree: A11yNode = {
      role: 'button',
      name: 'Submit',
      children: [],
    }
    const result = formatA11yTree(tree)
    assert.ok(
      !result.includes('[ref='),
      `Should not have [ref=...] in: ${result}`
    )
  })

  it('includes [ref=nodeId] alongside name in full format', () => {
    const tree: A11yNode = {
      role: 'navigation',
      name: 'Main',
      nodeId: 'nav-root',
      children: [
        {
          role: 'link',
          name: 'Home',
          nodeId: 'link-1',
          children: [],
        },
      ],
    }
    const result = formatA11yTree(tree)
    assert.ok(result.includes('navigation "Main" [ref=nav-root]'))
    assert.ok(result.includes('link "Home" [ref=link-1]'))
  })
})
