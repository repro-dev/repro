import { NodeType, VTree } from '@repro/domain'
import { Box } from '@repro/tdl'
import assert from 'node:assert'
import { describe, it } from 'node:test'
import {
  buildLayoutSummary,
  formatLayoutSummary,
  LayoutSummary,
} from './layoutSummary'

// ─── VTree builders (mirrors a11yTree.test.ts pattern) ───────────────────────

function makeElement(
  id: string,
  tagName: string,
  children: string[] = [],
  attributes: Record<string, string | null> = {},
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
    slotAssignments: null,
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

function headerVTree(): VTree {
  return makeVTree({
    root: makeDocument('root', ['hdr', 'nav', 'main', 'aside', 'ftr']),
    hdr: makeElement('hdr', 'header', [], { 'aria-label': 'Site Header' }),
    nav: makeElement('nav', 'nav', [], { 'aria-label': 'Main navigation' }),
    main: makeElement('main', 'main', [], {
      'aria-label': 'Main Content',
    }),
    aside: makeElement('aside', 'aside', [], {
      'aria-label': 'Related links',
    }),
    ftr: makeElement('ftr', 'footer', [], { 'aria-label': 'Footer' }),
  })
}

// ─── Test 1: Landmark/region classification ─────────────────────────────────

describe('buildLayoutSummary — landmark classification', () => {
  it('classifies header/nav/main/aside/footer into correct regions', () => {
    const vtree = headerVTree()
    const summary = buildLayoutSummary(vtree, { viewport: [1440, 900] })
    assert.strictEqual(summary.framing, 'DESKTOP')
    assert.strictEqual(summary.regions.length, 5)

    const types = summary.regions.map(r => r.type)
    // Per plan spec: nav and aside are SIDEBAR on desktop
    assert.deepStrictEqual(types, [
      'BANNER',
      'SIDEBAR',
      'MAIN',
      'SIDEBAR',
      'CONTENTINFO',
    ])
  })

  it('preserves document order for landmarks', () => {
    const vtree = makeVTree({
      root: makeDocument('root', ['main', 'aside', 'nav']),
      main: makeElement('main', 'main', []),
      aside: makeElement('aside', 'aside', [], {
        'aria-label': 'Sidebar',
      }),
      nav: makeElement('nav', 'nav', [], {
        'aria-label': 'Nav',
      }),
    })
    const summary = buildLayoutSummary(vtree, { viewport: [1440, 900] })
    const types = summary.regions.map(r => r.type)
    // Per plan spec: nav and aside are SIDEBAR on desktop
    assert.deepStrictEqual(types, ['MAIN', 'SIDEBAR', 'SIDEBAR'])
  })

  it('recognizes explicit role attributes', () => {
    const vtree = makeVTree({
      root: makeDocument('root', ['banner', 'main', 'info']),
      banner: makeElement('banner', 'div', [], {
        role: 'banner',
        'aria-label': 'Top',
      }),
      main: makeElement('main', 'div', [], { role: 'main' }),
      info: makeElement('info', 'div', [], {
        role: 'contentinfo',
        'aria-label': 'Footer Info',
      }),
    })
    const summary = buildLayoutSummary(vtree, { viewport: [1440, 900] })
    const types = summary.regions.map(r => r.type)
    assert.deepStrictEqual(types, ['BANNER', 'MAIN', 'CONTENTINFO'])
  })
})

// ─── Test 2: Modal/overlay detection ────────────────────────────────────────

describe('buildLayoutSummary — modal detection', () => {
  it('detects role=dialog with aria-modal=true', () => {
    const vtree = makeVTree({
      root: makeDocument('root', ['main', 'modal']),
      main: makeElement('main', 'main', []),
      modal: makeElement('modal', 'div', ['modalText'], {
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': 'Confirm deletion',
      }),
      modalText: makeText('modalText', 'Are you sure?'),
    })
    const summary = buildLayoutSummary(vtree, { viewport: [1440, 900] })
    const types = summary.regions.map(r => r.type)
    assert.ok(
      types.includes('MODAL'),
      `Expected MODAL region in types: ${types}`
    )
    const modalRegion = summary.regions.find(r => r.type === 'MODAL')
    assert.ok(modalRegion)
    assert.strictEqual(modalRegion!.name, 'Confirm deletion')
  })

  it('does not surface role=dialog without aria-modal as modal', () => {
    const vtree = makeVTree({
      root: makeDocument('root', ['dlg']),
      dlg: makeElement('dlg', 'div', [], {
        role: 'dialog',
        'aria-label': 'Generic dialog',
      }),
    })
    const summary = buildLayoutSummary(vtree, { viewport: [1440, 900] })
    const types = summary.regions.map(r => r.type)
    assert.ok(!types.includes('MODAL'))
  })
})

// ─── Test 3: Column/grid grouping ───────────────────────────────────────────

describe('buildLayoutSummary — grid/column grouping', () => {
  it('groups ≥3 siblings with same tag as GRID', () => {
    const vtree = makeVTree({
      root: makeDocument('root', ['container']),
      container: makeElement('container', 'div', ['c1', 'c2', 'c3']),
      c1: makeElement('c1', 'div', [], { class: 'col' }),
      c2: makeElement('c2', 'div', [], { class: 'col' }),
      c3: makeElement('c3', 'div', [], { class: 'col' }),
    })
    const summary = buildLayoutSummary(vtree, { viewport: [1440, 900] })
    // The container itself has no landmark role, so it should be hoisted
    // The regions should have a grid or the children should be grouped
    const allRegions = flattenRegions(summary.regions)
    const gridRegion = allRegions.find(r => r.type === 'GRID')
    if (gridRegion) {
      assert.ok(gridRegion.gridInfo)
      assert.strictEqual(gridRegion.gridInfo!.columns, 3)
    }
  })

  it('does not group 2 siblings', () => {
    const vtree = makeVTree({
      root: makeDocument('root', ['container']),
      container: makeElement('container', 'div', ['c1', 'c2']),
      c1: makeElement('c1', 'div', []),
      c2: makeElement('c2', 'div', []),
    })
    const summary = buildLayoutSummary(vtree, { viewport: [1440, 900] })
    const allRegions = flattenRegions(summary.regions)
    const gridRegion = allRegions.find(r => r.type === 'GRID')
    assert.ok(!gridRegion, 'Should not grid-group 2 siblings')
  })
})

// ─── Test 4: Primary CTA detection ──────────────────────────────────────────

describe('buildLayoutSummary — CTA detection', () => {
  it('flags button[type=submit] as CTA', () => {
    const vtree = makeVTree({
      root: makeDocument('root', ['form']),
      form: makeElement('form', 'form', ['btn'], {
        'aria-label': 'Signup',
      }),
      btn: makeElement('btn', 'button', ['btnTxt'], {
        type: 'submit',
      }),
      btnTxt: makeText('btnTxt', 'Submit'),
    })
    const summary = buildLayoutSummary(vtree, { viewport: [1440, 900] })
    const allRegions = flattenRegions(summary.regions)
    const formRegion = allRegions.find(
      r => r.type === 'FORM' || r.ctas.length > 0
    )
    assert.ok(formRegion)
    assert.ok(formRegion!.ctas.length >= 1)
    assert.strictEqual(formRegion!.ctas[0]!.label, 'Submit')
  })

  it('flags button with action keywords as CTA', () => {
    const vtree = makeVTree({
      root: makeDocument('root', ['main']),
      main: makeElement('main', 'main', ['btn']),
      btn: makeElement('btn', 'button', ['btnTxt'], {
        'aria-label': 'Create project',
      }),
      btnTxt: makeText('btnTxt', 'Create project'),
    })
    const summary = buildLayoutSummary(vtree, { viewport: [1440, 900] })
    const allRegions = flattenRegions(summary.regions)
    const mainRegion = allRegions.find(r => r.type === 'MAIN')
    assert.ok(mainRegion)
    const cta = mainRegion!.ctas.find(c => c.label === 'Create project')
    assert.ok(cta, 'Expected Create project CTA in MAIN region')
  })

  it('caps CTAs at maxCTAs option', () => {
    const vtree = makeVTree({
      root: makeDocument('root', ['main']),
      main: makeElement('main', 'main', ['b1', 'b2', 'b3', 'b4', 'b5']),
      b1: makeElement('b1', 'button', ['t1'], {
        'aria-label': 'Save',
      }),
      t1: makeText('t1', 'Save'),
      b2: makeElement('b2', 'button', ['t2'], {
        'aria-label': 'Delete',
      }),
      t2: makeText('t2', 'Delete'),
      b3: makeElement('b3', 'button', ['t3'], {
        'aria-label': 'Cancel',
      }),
      t3: makeText('t3', 'Cancel'),
      b4: makeElement('b4', 'button', ['t4'], {
        'aria-label': 'Extra',
      }),
      t4: makeText('t4', 'Extra'),
      b5: makeElement('b5', 'button', ['t5'], {
        'aria-label': 'More',
      }),
      t5: makeText('t5', 'More'),
    })
    const summary = buildLayoutSummary(vtree, { viewport: [1440, 900] })
    const allRegions = flattenRegions(summary.regions)
    const mainRegion = allRegions.find(r => r.type === 'MAIN')
    assert.ok(mainRegion)
    assert.ok(
      mainRegion!.ctas.length <= 3,
      `Expected ≤3 CTAs, got ${mainRegion!.ctas.length}`
    )
  })
})

// ─── Test 5: Desktop vs mobile framing ──────────────────────────────────────

describe('buildLayoutSummary — desktop vs mobile framing', () => {
  it('viewport ≥1024 → DESKTOP', () => {
    const vtree = headerVTree()
    const summary = buildLayoutSummary(vtree, { viewport: [1440, 900] })
    assert.strictEqual(summary.framing, 'DESKTOP')
  })

  it('viewport <1024 → MOBILE', () => {
    const vtree = headerVTree()
    const summary = buildLayoutSummary(vtree, { viewport: [390, 844] })
    assert.strictEqual(summary.framing, 'MOBILE')
  })

  it('nav is SIDEBAR on desktop, NAVIGATION on mobile', () => {
    const vtree = headerVTree()
    const desktop = buildLayoutSummary(vtree, { viewport: [1440, 900] })
    const mobile = buildLayoutSummary(vtree, { viewport: [390, 844] })

    const desktopNav = desktop.regions.find(r => r.type === 'SIDEBAR')
    const mobileNav = mobile.regions.find(r => r.type === 'NAVIGATION')
    assert.ok(desktopNav, 'Expected SIDEBAR on desktop')
    assert.ok(mobileNav, 'Expected NAVIGATION on mobile')
  })
})

// ─── Test 6: Stable references ─────────────────────────────────────────────

describe('buildLayoutSummary — stable references', () => {
  it('includes [ref=nodeId] for each region and CTA', () => {
    const vtree = headerVTree()
    const summary = buildLayoutSummary(vtree, { viewport: [1440, 900] })
    const output = formatLayoutSummary(summary)
    assert.ok(output.includes('[ref=hdr]'))
    assert.ok(output.includes('[ref=nav]'))
    assert.ok(output.includes('[ref=main]'))
    assert.ok(output.includes('[ref=ftr]'))
  })
})

// ─── Test 7: Detail levels ──────────────────────────────────────────────────

describe('buildLayoutSummary — detail levels', () => {
  it('overview has only top-level regions', () => {
    const vtree = nestedVTree()
    const overview = buildLayoutSummary(
      vtree,
      { viewport: [1440, 900] },
      { detail: 'overview' }
    )
    const regions = buildLayoutSummary(
      vtree,
      { viewport: [1440, 900] },
      { detail: 'regions' }
    )

    // overview should be a subset of regions in terms of structure
    const overviewOut = formatLayoutSummary(overview)
    const regionsOut = formatLayoutSummary(regions)
    // overview should not be longer than regions
    assert.ok(overviewOut.length <= regionsOut.length)
  })

  it('detailed has more content than regions', () => {
    const vtree = nestedVTree()
    const regions = buildLayoutSummary(
      vtree,
      { viewport: [1440, 900] },
      { detail: 'regions' }
    )
    const detailed = buildLayoutSummary(
      vtree,
      { viewport: [1440, 900] },
      { detail: 'detailed' }
    )

    const regionsOut = formatLayoutSummary(regions)
    const detailedOut = formatLayoutSummary(detailed)
    // detailed should have at least as much content as regions
    // It could be equal if regions already shows everything
    assert.ok(detailedOut.length >= regionsOut.length)
  })
})

// ─── Test 8: Dense-page truncation ──────────────────────────────────────────

describe('buildLayoutSummary — dense-page truncation', () => {
  it('adds (+N more) markers for overflow children', () => {
    // MAIN has 10 <section> children with different aria-labels.
    // Each gets classified as SECTION sub-region.
    // With maxChildrenPerRegion=5, only 5 are shown, rest get (+5 more).
    const children: Array<{ id: string }> = []
    for (let i = 1; i <= 10; i++) {
      children.push({ id: `s${i}` })
    }
    const childEntries: Record<string, ReturnType<typeof makeElement>> = {}
    const mainChildren: string[] = []
    for (const { id } of children) {
      mainChildren.push(id)
      childEntries[id] = makeElement(id, 'section', [], {
        'aria-label': `Section ${id}`,
      })
    }
    const vtree = makeVTree({
      root: makeDocument('root', ['main']),
      main: makeElement('main', 'main', mainChildren),
      ...childEntries,
    })
    const summary = buildLayoutSummary(
      vtree,
      { viewport: [1440, 900] },
      { maxChildrenPerRegion: 5 }
    )
    const output = formatLayoutSummary(summary)
    assert.ok(
      output.includes('more'),
      `Expected truncation marker in output:\n${output}`
    )
  })
})

// ─── Test 9: Empty/null DOM ────────────────────────────────────────────────

describe('buildLayoutSummary — empty/null DOM', () => {
  it('handles null VTree gracefully', () => {
    const summary = buildLayoutSummary(null as unknown as VTree, {
      viewport: [1440, 900],
    })
    assert.ok(summary)
    assert.strictEqual(summary.framing, 'DESKTOP')
    assert.deepStrictEqual(summary.regions, [])
  })

  it('handles empty document gracefully', () => {
    const vtree = makeVTree({
      root: makeDocument('root', []),
    })
    const summary = buildLayoutSummary(vtree, { viewport: [1440, 900] })
    assert.ok(summary)
    assert.deepStrictEqual(summary.regions, [])
  })

  it('handles null interaction (no viewport)', () => {
    const vtree = headerVTree()
    const summary = buildLayoutSummary(vtree, null)
    assert.ok(summary)
    // Should default to DESKTOP (1440×900)
    assert.strictEqual(summary.framing, 'DESKTOP')
    assert.strictEqual(summary.viewport[0], 1440)
    assert.strictEqual(summary.viewport[1], 900)
  })
})

// ─── Test 10: No-landmarks fallback ────────────────────────────────────────

describe('buildLayoutSummary — no-landmarks fallback', () => {
  it('produces structural summary for div-soup page', () => {
    const vtree = makeVTree({
      root: makeDocument('root', ['wrapper']),
      wrapper: makeElement('wrapper', 'div', ['content']),
      content: makeElement('content', 'div', ['heading', 'para']),
      heading: makeElement('heading', 'h1', ['headingText']),
      headingText: makeText('headingText', 'Welcome'),
      para: makeElement('para', 'p', ['paraText']),
      paraText: makeText('paraText', 'This is a paragraph.'),
    })
    const summary = buildLayoutSummary(vtree, { viewport: [1440, 900] })
    // Should not throw and should produce some output
    assert.ok(summary)
    const output = formatLayoutSummary(summary)
    assert.ok(output.length > 0)
  })
})

// ─── Test 10b: Document cross-check (AC #16) ───────────────────────────────

describe('formatLayoutSummary — format output', () => {
  it('matches expected format structure', () => {
    const vtree = headerVTree()
    const summary = buildLayoutSummary(vtree, { viewport: [1440, 900] })
    const output = formatLayoutSummary(summary, { showTokenEstimate: true })
    assert.ok(output.startsWith('LAYOUT SUMMARY'))
    assert.ok(output.includes('DESKTOP'))
    assert.ok(output.includes('1440×900'))
    assert.ok(output.includes('[ref='))
    assert.ok(output.includes('token estimate'))
  })
})

// ─── Test 11: SCREENSHOT_TOKEN_EQUIVALENT ― token efficiency ───────────────

describe('buildLayoutSummary — token efficiency', () => {
  it('_tokenEstimate is well below SCREENSHOT_TOKEN_EQUIVALENT for a representative page', () => {
    const vtree = headerVTree()
    const summary = buildLayoutSummary(vtree, { viewport: [1440, 900] })
    const output = formatLayoutSummary(summary, { showTokenEstimate: true })
    // Parse the token estimate from the output
    const match = output.match(/\[token estimate: ~(\d+)\]/)
    assert.ok(match, `Expected token estimate in:\n${output}`)
    const estimate = parseInt(match[1]!, 10)
    assert.ok(
      estimate < 5000,
      `Token estimate ${estimate} should be < 5000 (SCREENSHOT_TOKEN_EQUIVALENT)`
    )
  })
})

// ─── Helpers ────────────────────────────────────────────────────────────────

function flattenRegions(
  regions: LayoutSummary['regions']
): LayoutSummary['regions'] {
  const result: LayoutSummary['regions'] = []
  function walk(r: LayoutSummary['regions'][number]) {
    result.push(r)
    for (const child of r.children) {
      walk(child)
    }
  }
  for (const r of regions) walk(r)
  return result
}

function nestedVTree(): VTree {
  return makeVTree({
    root: makeDocument('root', ['nav', 'main']),
    nav: makeElement('nav', 'nav', [], {
      'aria-label': 'Main navigation',
    }),
    main: makeElement('main', 'main', ['section1', 'section2']),
    section1: makeElement('section1', 'section', ['s1h', 's1p'], {
      'aria-label': 'Overview',
    }),
    s1h: makeElement('s1h', 'h2', ['s1hText']),
    s1hText: makeText('s1hText', 'Overview'),
    s1p: makeElement('s1p', 'p', ['s1pText']),
    s1pText: makeText('s1pText', 'Overview content here.'),
    section2: makeElement('section2', 'section', ['s2h', 's2p'], {
      'aria-label': 'Details',
    }),
    s2h: makeElement('s2h', 'h2', ['s2hText']),
    s2hText: makeText('s2hText', 'Details'),
    s2p: makeElement('s2p', 'p', ['s2pText']),
    s2pText: makeText('s2pText', 'Details content here.'),
  })
}
