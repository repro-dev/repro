import { NodeType, Snapshot } from '@repro/domain'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { RecordingDataAccessor } from '../../../types'
import { executeTool, tools } from '../index'
import {
  makeAccessor,
  makeAddNodesPatchEvent,
  makeAttributePatchEvent,
  makeBooleanPropertyPatchEvent,
  makeNumberPropertyPatchEvent,
  makeRemoveNodesPatchEvent,
  makeTextPatchEvent,
  makeTextPropertyPatchEvent,
  runFuture,
} from './helpers'

// ─── VTree helpers ─────────────────────────────────────────────────────────────

function makeBoxedNode(node: Record<string, unknown>) {
  return {
    match: (fn: (n: unknown) => boolean) => fn(node),
    apply: (fn: (n: unknown) => void) => fn(node),
    get: (key: string) => ({
      orElse: (fallback: unknown) =>
        (node as Record<string, unknown>)[key] ?? fallback,
      map: (fn: (v: unknown) => unknown) => ({
        orElse: (fb: unknown) => {
          const val = (node as Record<string, unknown>)[key]
          return val != null ? fn(val) : fb
        },
      }),
    }),
  }
}

function makeVTree(nodes: Record<string, unknown>, rootId: string) {
  const boxedNodes: Record<string, unknown> = {}
  for (const [id, node] of Object.entries(nodes)) {
    boxedNodes[id] = makeBoxedNode(node as Record<string, unknown>)
  }
  return { rootId, nodes: boxedNodes }
}

function makeSnapshot(vtree: unknown): Snapshot {
  return { dom: vtree, interaction: null } as unknown as Snapshot
}

// Base VTree with div > section > span hierarchy
function makeDiffVTree() {
  return makeVTree(
    {
      doc: {
        type: NodeType.Document,
        id: 'doc',
        parentId: null,
        children: ['root'],
      },
      root: {
        type: NodeType.Element,
        id: 'root',
        parentId: 'doc',
        tagName: 'div',
        children: ['child1', 'txt1'],
        attributes: { id: 'root-div', class: 'container' },
        properties: { value: null, checked: null, selectedIndex: null },
        shadowRoot: false,
      },
      child1: {
        type: NodeType.Element,
        id: 'child1',
        parentId: 'root',
        tagName: 'section',
        children: ['grandchild1'],
        attributes: { class: 'section' },
        properties: { value: null, checked: null, selectedIndex: null },
        shadowRoot: false,
      },
      grandchild1: {
        type: NodeType.Element,
        id: 'grandchild1',
        parentId: 'child1',
        tagName: 'span',
        children: [],
        attributes: {},
        properties: { value: null, checked: null, selectedIndex: null },
        shadowRoot: false,
      },
      txt1: {
        type: NodeType.Text,
        id: 'txt1',
        parentId: 'root',
        value: 'Hello',
      },
      // Unrelated node, not in the subtree of 'root'
      unrelated: {
        type: NodeType.Element,
        id: 'unrelated',
        parentId: 'doc',
        tagName: 'footer',
        children: [],
        attributes: {},
        properties: { value: null, checked: null, selectedIndex: null },
        shadowRoot: false,
      },
    },
    'doc'
  )
}

function makeAccessorWithSnapshot(
  snapshotFn: (timestampMs: number) => Snapshot | null,
  events: ReturnType<typeof makeAttributePatchEvent>[] = []
): RecordingDataAccessor {
  return makeAccessor(events, 10000, snapshotFn)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('getDOMDiff tool registration', () => {
  it('tool exists in the tools array', async () => {
    const found = tools.find(
      t => 'function' in t && t.function.name === 'getDOMDiff'
    )
    assert.ok(found !== undefined, 'getDOMDiff should be in tools array')
  })
})

describe('getDOMDiff input validation (self-healing errors)', () => {
  it('missing nodeId → error, message mentions getDOMState', async () => {
    const accessor = makeAccessorWithSnapshot(() => null)
    const result = (await runFuture(
      executeTool(accessor, 'getDOMDiff', {
        fromTimestampMs: 0,
        toTimestampMs: 1000,
      })
    )) as Record<string, unknown>
    assert.ok('error' in result)
    assert.ok((result['suggestion'] as string).includes('getDOMState'))
  })

  it('missing fromTimestampMs → error, message mentions getRecordingDuration', async () => {
    const accessor = makeAccessorWithSnapshot(() => null)
    const result = (await runFuture(
      executeTool(accessor, 'getDOMDiff', {
        nodeId: 'root',
        toTimestampMs: 1000,
      })
    )) as Record<string, unknown>
    assert.ok('error' in result)
    assert.ok((result['suggestion'] as string).includes('getRecordingDuration'))
  })

  it('missing toTimestampMs → error, message mentions getRecordingDuration', async () => {
    const accessor = makeAccessorWithSnapshot(() => null)
    const result = (await runFuture(
      executeTool(accessor, 'getDOMDiff', {
        nodeId: 'root',
        fromTimestampMs: 0,
      })
    )) as Record<string, unknown>
    assert.ok('error' in result)
    assert.ok((result['suggestion'] as string).includes('getRecordingDuration'))
  })

  it('fromTimestampMs >= toTimestampMs → error about invalid range', async () => {
    const accessor = makeAccessorWithSnapshot(() => null)
    const result = (await runFuture(
      executeTool(accessor, 'getDOMDiff', {
        nodeId: 'root',
        fromTimestampMs: 1000,
        toTimestampMs: 1000,
      })
    )) as Record<string, unknown>
    assert.ok('error' in result)
    assert.ok(
      (result['error'] as string).toLowerCase().includes('range') ||
        (result['reason'] as string)?.toLowerCase().includes('range') ||
        (result['error'] as string).toLowerCase().includes('timestamp')
    )
  })

  it('no snapshot → error about no snapshot, mentions getRecordingDuration', async () => {
    const accessor = makeAccessorWithSnapshot(() => null)
    const result = (await runFuture(
      executeTool(accessor, 'getDOMDiff', {
        nodeId: 'root',
        fromTimestampMs: 0,
        toTimestampMs: 1000,
      })
    )) as Record<string, unknown>
    assert.ok('error' in result)
    assert.ok((result['suggestion'] as string).includes('getRecordingDuration'))
  })

  it('node not in snapshot → error about stale nodeId, mentions getDOMState', async () => {
    const vtree = makeDiffVTree()
    const accessor = makeAccessorWithSnapshot(() => makeSnapshot(vtree))
    const result = (await runFuture(
      executeTool(accessor, 'getDOMDiff', {
        nodeId: 'nonexistent-node',
        fromTimestampMs: 0,
        toTimestampMs: 1000,
      })
    )) as Record<string, unknown>
    assert.ok('error' in result)
    assert.ok((result['suggestion'] as string).includes('getDOMState'))
  })
})

describe('getDOMDiff attribute changes', () => {
  it('attribute change on target node → appears in changes', async () => {
    const vtree = makeDiffVTree()
    const events = [
      makeAttributePatchEvent(500, 'root', 'class', 'new-class', 'container'),
    ]
    const accessor = makeAccessorWithSnapshot(() => makeSnapshot(vtree), events)
    const result = (await runFuture(
      executeTool(accessor, 'getDOMDiff', {
        nodeId: 'root',
        fromTimestampMs: 0,
        toTimestampMs: 1000,
        detail: 'normal',
      })
    )) as Record<string, unknown>

    assert.ok(!('error' in result))
    const changes = result['changes'] as Array<Record<string, unknown>>
    assert.ok(Array.isArray(changes))
    const attrChange = changes.find(
      c => c['type'] === 'attribute' && c['nodeId'] === 'root'
    )
    assert.ok(attrChange, 'attribute change on target should appear in changes')
  })

  it('attribute change on child node (in subtree) → appears in changes', async () => {
    const vtree = makeDiffVTree()
    const events = [
      makeAttributePatchEvent(500, 'child1', 'class', 'new-section', 'section'),
    ]
    const accessor = makeAccessorWithSnapshot(() => makeSnapshot(vtree), events)
    const result = (await runFuture(
      executeTool(accessor, 'getDOMDiff', {
        nodeId: 'root',
        fromTimestampMs: 0,
        toTimestampMs: 1000,
        detail: 'normal',
      })
    )) as Record<string, unknown>

    assert.ok(!('error' in result))
    const changes = result['changes'] as Array<Record<string, unknown>>
    const childChange = changes.find(
      c => c['type'] === 'attribute' && c['nodeId'] === 'child1'
    )
    assert.ok(childChange, 'attribute change on child should appear in changes')
  })

  it('attribute change on unrelated node → filtered out', async () => {
    const vtree = makeDiffVTree()
    const events = [
      makeAttributePatchEvent(500, 'unrelated', 'class', 'new', 'old'),
    ]
    const accessor = makeAccessorWithSnapshot(() => makeSnapshot(vtree), events)
    const result = (await runFuture(
      executeTool(accessor, 'getDOMDiff', {
        nodeId: 'root',
        fromTimestampMs: 0,
        toTimestampMs: 1000,
        detail: 'normal',
      })
    )) as Record<string, unknown>

    assert.ok(!('error' in result))
    const changes = result['changes'] as Array<Record<string, unknown>>
    const unrelatedChange = changes?.find(c => c['nodeId'] === 'unrelated')
    assert.strictEqual(
      unrelatedChange,
      undefined,
      'unrelated node changes should be filtered out'
    )
  })

  it('value and oldValue both present in normal/full tier', async () => {
    const vtree = makeDiffVTree()
    const events = [
      makeAttributePatchEvent(500, 'root', 'class', 'new-class', 'container'),
    ]
    const accessor = makeAccessorWithSnapshot(() => makeSnapshot(vtree), events)
    const result = (await runFuture(
      executeTool(accessor, 'getDOMDiff', {
        nodeId: 'root',
        fromTimestampMs: 0,
        toTimestampMs: 1000,
        detail: 'normal',
      })
    )) as Record<string, unknown>

    const changes = result['changes'] as Array<Record<string, unknown>>
    const attrChange = changes.find(c => c['type'] === 'attribute')
    assert.ok(attrChange)
    assert.ok('value' in attrChange)
    assert.ok('oldValue' in attrChange)
  })
})

describe('getDOMDiff text changes', () => {
  it('text change on text node child of target → appears in changes', async () => {
    const vtree = makeDiffVTree()
    const events = [makeTextPatchEvent(500, 'txt1', 'World', 'Hello')]
    const accessor = makeAccessorWithSnapshot(() => makeSnapshot(vtree), events)
    const result = (await runFuture(
      executeTool(accessor, 'getDOMDiff', {
        nodeId: 'root',
        fromTimestampMs: 0,
        toTimestampMs: 1000,
        detail: 'normal',
      })
    )) as Record<string, unknown>

    assert.ok(!('error' in result))
    const changes = result['changes'] as Array<Record<string, unknown>>
    const textChange = changes.find(c => c['type'] === 'text')
    assert.ok(textChange, 'text change should appear in changes')
    assert.strictEqual(textChange!['nodeId'], 'txt1')
  })

  it('text change on unrelated node → filtered out', async () => {
    const vtree = makeDiffVTree()
    const events = [makeTextPatchEvent(500, 'unrelated-txt', 'new', 'old')]
    const accessor = makeAccessorWithSnapshot(() => makeSnapshot(vtree), events)
    const result = (await runFuture(
      executeTool(accessor, 'getDOMDiff', {
        nodeId: 'root',
        fromTimestampMs: 0,
        toTimestampMs: 1000,
        detail: 'normal',
      })
    )) as Record<string, unknown>

    assert.ok(!('error' in result))
    const changes = result['changes'] as Array<Record<string, unknown>>
    const unrelatedChange = changes?.find(c => c['nodeId'] === 'unrelated-txt')
    assert.strictEqual(unrelatedChange, undefined)
  })
})

describe('getDOMDiff structural changes', () => {
  it('AddNodes under target → nodesAdded count incremented', async () => {
    const vtree = makeDiffVTree()
    const events = [makeAddNodesPatchEvent(500, 'root', ['new-node-1'])]
    const accessor = makeAccessorWithSnapshot(() => makeSnapshot(vtree), events)
    const result = (await runFuture(
      executeTool(accessor, 'getDOMDiff', {
        nodeId: 'root',
        fromTimestampMs: 0,
        toTimestampMs: 1000,
        detail: 'normal',
      })
    )) as Record<string, unknown>

    assert.ok(!('error' in result))
    assert.strictEqual(result['nodesAdded'], 1)
  })

  it('RemoveNodes under target → nodesRemoved count incremented', async () => {
    const vtree = makeDiffVTree()
    const events = [makeRemoveNodesPatchEvent(500, 'root', ['child1'])]
    const accessor = makeAccessorWithSnapshot(() => makeSnapshot(vtree), events)
    const result = (await runFuture(
      executeTool(accessor, 'getDOMDiff', {
        nodeId: 'root',
        fromTimestampMs: 0,
        toTimestampMs: 1000,
        detail: 'normal',
      })
    )) as Record<string, unknown>

    assert.ok(!('error' in result))
    assert.strictEqual(result['nodesRemoved'], 1)
  })

  it('full tier includes addedNodeIds and removedNodeIds', async () => {
    const vtree = makeDiffVTree()
    const events = [
      makeAddNodesPatchEvent(400, 'root', ['new-node-1']),
      makeRemoveNodesPatchEvent(600, 'root', ['child1']),
    ]
    const accessor = makeAccessorWithSnapshot(() => makeSnapshot(vtree), events)
    const result = (await runFuture(
      executeTool(accessor, 'getDOMDiff', {
        nodeId: 'root',
        fromTimestampMs: 0,
        toTimestampMs: 1000,
        detail: 'full',
      })
    )) as Record<string, unknown>

    assert.ok(!('error' in result))
    assert.ok('addedNodeIds' in result)
    assert.ok('removedNodeIds' in result)
    assert.ok(
      (result['addedNodeIds'] as string[]).includes('new-node-1'),
      'addedNodeIds should contain new-node-1'
    )
    assert.ok(
      (result['removedNodeIds'] as string[]).includes('child1'),
      'removedNodeIds should contain child1'
    )
  })

  it('normal tier does NOT include addedNodeIds or removedNodeIds', async () => {
    const vtree = makeDiffVTree()
    const events = [
      makeAddNodesPatchEvent(400, 'root', ['new-node-1']),
      makeRemoveNodesPatchEvent(600, 'root', ['child1']),
    ]
    const accessor = makeAccessorWithSnapshot(() => makeSnapshot(vtree), events)
    const result = (await runFuture(
      executeTool(accessor, 'getDOMDiff', {
        nodeId: 'root',
        fromTimestampMs: 0,
        toTimestampMs: 1000,
        detail: 'normal',
      })
    )) as Record<string, unknown>

    assert.ok(!('error' in result))
    assert.ok(!('addedNodeIds' in result))
    assert.ok(!('removedNodeIds' in result))
  })
})

describe('getDOMDiff detail tiers', () => {
  it('summary → returns counts only, no changes array', async () => {
    const vtree = makeDiffVTree()
    const events = [makeAttributePatchEvent(500, 'root', 'class', 'new', 'old')]
    const accessor = makeAccessorWithSnapshot(() => makeSnapshot(vtree), events)
    const result = (await runFuture(
      executeTool(accessor, 'getDOMDiff', {
        nodeId: 'root',
        fromTimestampMs: 0,
        toTimestampMs: 1000,
        detail: 'summary',
      })
    )) as Record<string, unknown>

    assert.ok(!('error' in result))
    assert.ok(
      !('changes' in result),
      'summary should not include changes array'
    )
    assert.ok('attributeChanges' in result || 'nodesAdded' in result)
    assert.ok('_tokenEstimate' in result)
  })

  it('normal → includes changes with truncated values (max 100 chars)', async () => {
    const vtree = makeDiffVTree()
    const longValue = 'x'.repeat(200)
    const events = [
      makeAttributePatchEvent(500, 'root', 'class', longValue, 'old'),
    ]
    const accessor = makeAccessorWithSnapshot(() => makeSnapshot(vtree), events)
    const result = (await runFuture(
      executeTool(accessor, 'getDOMDiff', {
        nodeId: 'root',
        fromTimestampMs: 0,
        toTimestampMs: 1000,
        detail: 'normal',
      })
    )) as Record<string, unknown>

    assert.ok(!('error' in result))
    assert.ok('changes' in result)
    const changes = result['changes'] as Array<Record<string, unknown>>
    assert.ok(changes.length > 0)
    const change = changes[0]!
    assert.ok(
      typeof change['value'] === 'string' &&
        (change['value'] as string).length <= 100,
      'normal tier values should be truncated to 100 chars'
    )
    assert.ok('_tokenEstimate' in result)
  })

  it('full → includes changes with full values', async () => {
    const vtree = makeDiffVTree()
    const longValue = 'x'.repeat(200)
    const events = [
      makeAttributePatchEvent(500, 'root', 'class', longValue, 'old'),
    ]
    const accessor = makeAccessorWithSnapshot(() => makeSnapshot(vtree), events)
    const result = (await runFuture(
      executeTool(accessor, 'getDOMDiff', {
        nodeId: 'root',
        fromTimestampMs: 0,
        toTimestampMs: 1000,
        detail: 'full',
      })
    )) as Record<string, unknown>

    assert.ok(!('error' in result))
    assert.ok('changes' in result)
    const changes = result['changes'] as Array<Record<string, unknown>>
    assert.ok(changes.length > 0)
    const change = changes[0]!
    assert.ok(
      typeof change['value'] === 'string' &&
        (change['value'] as string).length === 200,
      'full tier values should not be truncated'
    )
    assert.ok('_tokenEstimate' in result)
  })

  it('all tiers include _tokenEstimate', async () => {
    const vtree = makeDiffVTree()
    const events = [makeAttributePatchEvent(500, 'root', 'class', 'new', 'old')]
    for (const detail of ['summary', 'normal', 'full'] as const) {
      const accessor = makeAccessorWithSnapshot(
        () => makeSnapshot(vtree),
        events
      )
      const result = (await runFuture(
        executeTool(accessor, 'getDOMDiff', {
          nodeId: 'root',
          fromTimestampMs: 0,
          toTimestampMs: 1000,
          detail,
        })
      )) as Record<string, unknown>
      assert.ok(!('error' in result))
      assert.ok(
        '_tokenEstimate' in result,
        `detail:${detail} should include _tokenEstimate`
      )
      assert.ok(
        typeof result['_tokenEstimate'] === 'number' &&
          (result['_tokenEstimate'] as number) > 0,
        `_tokenEstimate should be > 0 for detail:${detail}`
      )
    }
  })
})

describe('getDOMDiff time range filtering', () => {
  it('only patches within [fromTimestampMs, toTimestampMs] range are included', async () => {
    const vtree = makeDiffVTree()
    const events = [
      makeAttributePatchEvent(500, 'root', 'class', 'in-range', 'old'),
    ]
    const accessor = makeAccessorWithSnapshot(() => makeSnapshot(vtree), events)
    const result = (await runFuture(
      executeTool(accessor, 'getDOMDiff', {
        nodeId: 'root',
        fromTimestampMs: 0,
        toTimestampMs: 1000,
        detail: 'normal',
      })
    )) as Record<string, unknown>

    assert.ok(!('error' in result))
    const changes = result['changes'] as Array<Record<string, unknown>>
    assert.ok(changes.length > 0, 'in-range patch should be included')
  })

  it('patches before fromTimestampMs are excluded', async () => {
    const vtree = makeDiffVTree()
    // The makeAccessor uses getEventsByType which filters by startMs/endMs.
    // We test this by checking that events at time=50 are not included
    // when fromTimestampMs=100
    const events = [
      makeAttributePatchEvent(50, 'root', 'class', 'before-range', 'old'),
    ]
    const accessor = makeAccessorWithSnapshot(() => makeSnapshot(vtree), events)
    const result = (await runFuture(
      executeTool(accessor, 'getDOMDiff', {
        nodeId: 'root',
        fromTimestampMs: 100,
        toTimestampMs: 1000,
        detail: 'normal',
      })
    )) as Record<string, unknown>

    assert.ok(!('error' in result))
    const changes = result['changes'] as Array<Record<string, unknown>>
    // No changes because the event was before the range
    const inRangeChanges = changes.filter(
      c => (c['value'] as string) === 'before-range'
    )
    assert.strictEqual(
      inRangeChanges.length,
      0,
      'patch before range should be excluded'
    )
  })

  it('patches after toTimestampMs are excluded', async () => {
    const vtree = makeDiffVTree()
    const events = [
      makeAttributePatchEvent(2000, 'root', 'class', 'after-range', 'old'),
    ]
    const accessor = makeAccessorWithSnapshot(() => makeSnapshot(vtree), events)
    const result = (await runFuture(
      executeTool(accessor, 'getDOMDiff', {
        nodeId: 'root',
        fromTimestampMs: 0,
        toTimestampMs: 1000,
        detail: 'normal',
      })
    )) as Record<string, unknown>

    assert.ok(!('error' in result))
    const changes = result['changes'] as Array<Record<string, unknown>>
    const afterRangeChanges = changes.filter(
      c => (c['value'] as string) === 'after-range'
    )
    assert.strictEqual(
      afterRangeChanges.length,
      0,
      'patch after range should be excluded'
    )
  })
})

describe('getDOMDiff edge cases', () => {
  it('no patches in range → zero counts, empty/absent changes', async () => {
    const vtree = makeDiffVTree()
    const accessor = makeAccessorWithSnapshot(() => makeSnapshot(vtree), [])
    const result = (await runFuture(
      executeTool(accessor, 'getDOMDiff', {
        nodeId: 'root',
        fromTimestampMs: 0,
        toTimestampMs: 1000,
        detail: 'normal',
      })
    )) as Record<string, unknown>

    assert.ok(!('error' in result))
    assert.strictEqual(result['nodesAdded'], 0)
    assert.strictEqual(result['nodesRemoved'], 0)
    assert.strictEqual(result['attributeChanges'], 0)
    const changes = result['changes'] as unknown[]
    assert.ok(
      changes === undefined || (Array.isArray(changes) && changes.length === 0)
    )
  })

  it('empty subtree (no children) → still processes patches on root node itself', async () => {
    const vtree = makeVTree(
      {
        root: {
          type: NodeType.Element,
          id: 'root',
          parentId: null,
          tagName: 'div',
          children: [],
          attributes: { class: 'empty' },
          properties: { value: null, checked: null, selectedIndex: null },
          shadowRoot: false,
        },
      },
      'root'
    )
    const events = [
      makeAttributePatchEvent(500, 'root', 'class', 'updated', 'empty'),
    ]
    const accessor = makeAccessorWithSnapshot(() => makeSnapshot(vtree), events)
    const result = (await runFuture(
      executeTool(accessor, 'getDOMDiff', {
        nodeId: 'root',
        fromTimestampMs: 0,
        toTimestampMs: 1000,
        detail: 'normal',
      })
    )) as Record<string, unknown>

    assert.ok(!('error' in result))
    assert.strictEqual(result['attributeChanges'], 1)
  })
})

describe('getDOMDiff property changes', () => {
  it('TextProperty change on in-scope node → propertyChanges incremented and appears in changes', async () => {
    const vtree = makeDiffVTree()
    const events = [
      makeTextPropertyPatchEvent(500, 'root', 'value', 'new-val', 'old-val'),
    ]
    const accessor = makeAccessorWithSnapshot(() => makeSnapshot(vtree), events)
    const result = (await runFuture(
      executeTool(accessor, 'getDOMDiff', {
        nodeId: 'root',
        fromTimestampMs: 0,
        toTimestampMs: 1000,
        detail: 'normal',
      })
    )) as Record<string, unknown>

    assert.ok(!('error' in result))
    assert.strictEqual(result['propertyChanges'], 1)
    const changes = result['changes'] as Array<Record<string, unknown>>
    const propChange = changes.find(c => c['type'] === 'property')
    assert.ok(
      propChange,
      'TextProperty change should appear as type:property in changes'
    )
    assert.strictEqual(propChange!['nodeId'], 'root')
    assert.strictEqual(propChange!['name'], 'value')
    assert.strictEqual(propChange!['value'], 'new-val')
    assert.strictEqual(propChange!['oldValue'], 'old-val')
  })

  it('BooleanProperty change on in-scope node → propertyChanges incremented, value coerced to string', async () => {
    const vtree = makeDiffVTree()
    const events = [
      makeBooleanPropertyPatchEvent(500, 'root', 'checked', true, false),
    ]
    const accessor = makeAccessorWithSnapshot(() => makeSnapshot(vtree), events)
    const result = (await runFuture(
      executeTool(accessor, 'getDOMDiff', {
        nodeId: 'root',
        fromTimestampMs: 0,
        toTimestampMs: 1000,
        detail: 'normal',
      })
    )) as Record<string, unknown>

    assert.ok(!('error' in result))
    assert.strictEqual(result['propertyChanges'], 1)
    const changes = result['changes'] as Array<Record<string, unknown>>
    const propChange = changes.find(c => c['type'] === 'property')
    assert.ok(
      propChange,
      'BooleanProperty change should appear as type:property in changes'
    )
    // Boolean values are coerced to strings in normal/full tier
    assert.strictEqual(propChange!['value'], 'true')
    assert.strictEqual(propChange!['oldValue'], 'false')
  })

  it('NumberProperty change on in-scope node → propertyChanges incremented, value coerced to string', async () => {
    const vtree = makeDiffVTree()
    const events = [
      makeNumberPropertyPatchEvent(500, 'root', 'selectedIndex', 2, 0),
    ]
    const accessor = makeAccessorWithSnapshot(() => makeSnapshot(vtree), events)
    const result = (await runFuture(
      executeTool(accessor, 'getDOMDiff', {
        nodeId: 'root',
        fromTimestampMs: 0,
        toTimestampMs: 1000,
        detail: 'normal',
      })
    )) as Record<string, unknown>

    assert.ok(!('error' in result))
    assert.strictEqual(result['propertyChanges'], 1)
    const changes = result['changes'] as Array<Record<string, unknown>>
    const propChange = changes.find(c => c['type'] === 'property')
    assert.ok(
      propChange,
      'NumberProperty change should appear as type:property in changes'
    )
    assert.strictEqual(propChange!['value'], '2')
    assert.strictEqual(propChange!['oldValue'], '0')
  })

  it('property change on unrelated node → filtered out', async () => {
    const vtree = makeDiffVTree()
    const events = [
      makeTextPropertyPatchEvent(500, 'unrelated', 'value', 'x', 'y'),
    ]
    const accessor = makeAccessorWithSnapshot(() => makeSnapshot(vtree), events)
    const result = (await runFuture(
      executeTool(accessor, 'getDOMDiff', {
        nodeId: 'root',
        fromTimestampMs: 0,
        toTimestampMs: 1000,
        detail: 'normal',
      })
    )) as Record<string, unknown>

    assert.ok(!('error' in result))
    assert.strictEqual(result['propertyChanges'], 0)
    const changes = result['changes'] as Array<Record<string, unknown>>
    const unrelated = changes?.find(c => c['nodeId'] === 'unrelated')
    assert.strictEqual(unrelated, undefined)
  })

  it('summary tier counts property changes but omits changes array', async () => {
    const vtree = makeDiffVTree()
    const events = [
      makeTextPropertyPatchEvent(500, 'root', 'value', 'new', 'old'),
    ]
    const accessor = makeAccessorWithSnapshot(() => makeSnapshot(vtree), events)
    const result = (await runFuture(
      executeTool(accessor, 'getDOMDiff', {
        nodeId: 'root',
        fromTimestampMs: 0,
        toTimestampMs: 1000,
        detail: 'summary',
      })
    )) as Record<string, unknown>

    assert.ok(!('error' in result))
    assert.strictEqual(result['propertyChanges'], 1)
    assert.ok(
      !('changes' in result),
      'summary tier should not include changes array'
    )
  })
})

describe('getDOMDiff scope-set expansion', () => {
  it('patch on a node added via AddNodes is included in changes', async () => {
    // This tests the core scope-set expansion feature: when AddNodes fires for
    // parentId in scope, the newly-added node rootId is added to scopeIds.
    // A subsequent attribute patch on that new node must be captured.
    const vtree = makeDiffVTree()
    const events = [
      // First: add a new node under root
      makeAddNodesPatchEvent(300, 'root', ['new-node-1']),
      // Second: patch on the newly-added node — should now be in scope
      makeAttributePatchEvent(600, 'new-node-1', 'class', 'active', ''),
    ]
    const accessor = makeAccessorWithSnapshot(() => makeSnapshot(vtree), events)
    const result = (await runFuture(
      executeTool(accessor, 'getDOMDiff', {
        nodeId: 'root',
        fromTimestampMs: 0,
        toTimestampMs: 1000,
        detail: 'normal',
      })
    )) as Record<string, unknown>

    assert.ok(!('error' in result))
    assert.strictEqual(result['nodesAdded'], 1)
    // The attribute change on the newly-added node should be captured
    assert.strictEqual(result['attributeChanges'], 1)
    const changes = result['changes'] as Array<Record<string, unknown>>
    const patchOnNewNode = changes.find(
      c => c['type'] === 'attribute' && c['nodeId'] === 'new-node-1'
    )
    assert.ok(
      patchOnNewNode,
      'attribute patch on node added via AddNodes should appear in changes (scope expansion)'
    )
  })

  it('patch on a node added under an unrelated parent is NOT included', async () => {
    const vtree = makeDiffVTree()
    const events = [
      // Add a node under the unrelated node (not in scope)
      makeAddNodesPatchEvent(300, 'unrelated', ['new-node-2']),
      // Patch on the newly-added node — parent was not in scope, so this should be excluded
      makeAttributePatchEvent(600, 'new-node-2', 'class', 'active', ''),
    ]
    const accessor = makeAccessorWithSnapshot(() => makeSnapshot(vtree), events)
    const result = (await runFuture(
      executeTool(accessor, 'getDOMDiff', {
        nodeId: 'root',
        fromTimestampMs: 0,
        toTimestampMs: 1000,
        detail: 'normal',
      })
    )) as Record<string, unknown>

    assert.ok(!('error' in result))
    assert.strictEqual(result['nodesAdded'], 0)
    assert.strictEqual(result['attributeChanges'], 0)
    const changes = result['changes'] as Array<Record<string, unknown>>
    const patchOnNewNode = changes?.find(c => c['nodeId'] === 'new-node-2')
    assert.strictEqual(patchOnNewNode, undefined)
  })

  it('RemoveNodes removes node from scope; subsequent patch on removed node is excluded', async () => {
    const vtree = makeDiffVTree()
    const events = [
      // Remove child1 from root
      makeRemoveNodesPatchEvent(300, 'root', ['child1']),
      // Patch on child1 after removal — should no longer be in scope
      makeAttributePatchEvent(600, 'child1', 'class', 'ghost', 'section'),
    ]
    const accessor = makeAccessorWithSnapshot(() => makeSnapshot(vtree), events)
    const result = (await runFuture(
      executeTool(accessor, 'getDOMDiff', {
        nodeId: 'root',
        fromTimestampMs: 0,
        toTimestampMs: 1000,
        detail: 'normal',
      })
    )) as Record<string, unknown>

    assert.ok(!('error' in result))
    assert.strictEqual(result['nodesRemoved'], 1)
    // After removal, child1 is out of scope — the attribute change should NOT be counted
    assert.strictEqual(result['attributeChanges'], 0)
    const changes = result['changes'] as Array<Record<string, unknown>>
    const patchAfterRemoval = changes?.find(c => c['nodeId'] === 'child1')
    assert.strictEqual(
      patchAfterRemoval,
      undefined,
      'patch on removed node should not appear in changes'
    )
  })
})
