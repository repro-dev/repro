import { NodeType, type Snapshot } from '@repro/domain'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { executeTool } from '../index'
import { makeAccessor, makeEmptyAccessor, runFuture } from './helpers'

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

function makeSnapshot(vtree: unknown): Snapshot {
  return { dom: vtree, interaction: null } as unknown as Snapshot
}

function makeSnapshotAccessor() {
  const vtree = {
    rootId: 'root',
    nodes: {
      root: makeBoxedNode({
        type: NodeType.Element,
        id: 'root',
        parentId: null,
        tagName: 'div',
        children: [],
        attributes: {},
        properties: { value: null, checked: null, selectedIndex: null },
        shadowRoot: false,
        slotAssignments: null,
      }),
    },
  }

  return makeAccessor([], 42, () => makeSnapshot(vtree))
}

describe('schema-aware tool validation', () => {
  it('ignores harmless extra metadata on a valid call', async () => {
    const accessor = makeAccessor([], 42)

    const result = (await runFuture(
      executeTool(accessor, 'getRecordingDuration', {
        _meta: { trace: 'agent metadata' },
        requestId: 'request-123',
      })
    )) as {
      durationMs: number
      _tokenEstimate: number
    }

    assert.equal(result.durationMs, 42)
    assert.ok(result._tokenEstimate > 0)
  })

  it('reports an exact enum path and concrete retry example', async () => {
    const accessor = makeEmptyAccessor()

    const result = (await runFuture(
      executeTool(accessor, 'getNetworkRequests', {
        detail: 'verbose',
      })
    )) as {
      error: string
      reason: string
      suggestion: string
    }

    assert.ok(result.error.includes('args.detail'))
    assert.ok(result.reason.includes('verbose'))
    assert.ok(
      result.suggestion.includes('getNetworkRequests({"detail":"normal"})')
    )
    assert.ok(!result.suggestion.includes('statusMin'))
    assert.ok(!result.suggestion.includes('timeRangeStartMs'))
  })

  it('rejects hallucinated unknown fields with an exact path', async () => {
    const accessor = makeSnapshotAccessor()

    const result = (await runFuture(
      executeTool(accessor, 'getDOMState', {
        timestampMs: 0,
        time: 0,
      })
    )) as {
      error: string
      reason: string
      suggestion: string
    }

    assert.ok(result.error.includes('args.time'))
    assert.ok(result.reason.includes('time'))
    assert.ok(result.suggestion.includes('getDOMState({'))
  })

  it('reports a missing required field with its exact path', async () => {
    const accessor = makeEmptyAccessor()

    const result = (await runFuture(
      executeTool(accessor, 'getEventsAroundTime', {
        windowMs: 1000,
      })
    )) as {
      error: string
      reason: string
      suggestion: string
    }

    assert.ok(result.error.includes('args.timestampMs'))
    assert.ok(result.suggestion.includes('getEventsAroundTime({'))
  })

  it('reports a wrong timestamp shape before the handler runs', async () => {
    const accessor = makeEmptyAccessor()

    const result = (await runFuture(
      executeTool(accessor, 'getEventsAroundTime', {
        timestampMs: 'soon',
      } as unknown as Record<string, unknown>)
    )) as {
      error: string
      reason: string
      suggestion: string
    }

    assert.ok(result.error.includes('args.timestampMs'))
    assert.ok(result.error.toLowerCase().includes('number'))
    assert.ok(result.suggestion.includes('getRecordingDuration'))
    assert.ok(
      result.suggestion.includes('getEventsAroundTime({"timestampMs":0})')
    )
  })

  it('reports nested array object validation failures', async () => {
    const accessor = makeEmptyAccessor()

    const result = (await runFuture(
      executeTool(accessor, 'advanceStage', {
        stage: 'hypotheses',
        hypotheses: [
          {
            id: 'h-1',
            description: 'missing evidence',
          },
        ],
      })
    )) as {
      error: string
      reason: string
      suggestion: string
    }

    assert.ok(result.error.includes('args.hypotheses[0].evidence'))
    assert.ok(result.suggestion.includes('advanceStage({'))
  })

  it('still reports stale node ids with a concrete recovery call', async () => {
    const accessor = makeSnapshotAccessor()

    const result = (await runFuture(
      executeTool(accessor, 'getElementDetails', {
        nodeId: 'missing-node',
        timestampMs: 0,
      })
    )) as {
      error: string
      reason: string
      suggestion: string
    }

    assert.ok(result.error.toLowerCase().includes('missing-node'))
    assert.ok(result.suggestion.includes('getDOMState'))
  })

  it('reports invalid enum array values with exact array item paths', async () => {
    const accessor = makeEmptyAccessor()

    const result = (await runFuture(
      executeTool(accessor, 'getEvents', {
        eventTypes: ['clicks'],
      })
    )) as {
      error: string
      reason: string
      suggestion: string
    }

    assert.ok(result.error.includes('args.eventTypes[0]'))
    assert.ok(result.reason.includes('clicks'))
    assert.ok(result.suggestion.includes('getEvents({'))
  })
})
