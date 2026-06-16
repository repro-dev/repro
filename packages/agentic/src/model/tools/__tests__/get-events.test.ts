import { NodeId } from '@repro/domain'
import { resolve } from 'fluture'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { makeAccessorFromEventList } from '../../../recordingDataAccessor'
import { RecordingDataAccessor } from '../../../types'
import { executeTool, tools } from '../index'
import {
  makeAccessor,
  makeClickEvent,
  makeDOMPatchEvent,
  makeDoubleClickEvent,
  makeEmptyAccessor,
  makeKeyDownEvent,
  makePageTransitionEvent,
  makePointerDownEvent,
  makePointerMoveEvent,
  makePointerUpEvent,
  makeScrollEvent,
  makeViewportResizeEvent,
  runFuture,
} from './helpers'

describe('tools array — getEvents', () => {
  it('includes getEvents in tools array', async () => {
    const def = tools.find(
      t => (t as { function: { name: string } }).function.name === 'getEvents'
    )
    assert.ok(def !== undefined)
  })
})

describe('executeTool — getEvents — empty recording', () => {
  it('returns empty events for empty recording', async () => {
    const accessor = makeEmptyAccessor()
    const result = (await runFuture(
      executeTool(accessor, 'getEvents', {})
    )) as {
      events: unknown[]
      _tokenEstimate: number
    }
    assert.deepStrictEqual(result.events, [])
    assert.ok(typeof result._tokenEstimate === 'number')
  })
})

describe('executeTool — getEvents — basic events', () => {
  it('returns pageTransition and click events at normal tier', async () => {
    const events = [
      makePageTransitionEvent(0, '/products'),
      makeClickEvent(1200, '"Widget Pro" link'),
    ]
    const accessor = makeAccessor(events)
    const result = (await runFuture(
      executeTool(accessor, 'getEvents', {})
    )) as {
      events: Array<Record<string, unknown>>
    }
    assert.strictEqual(result.events.length, 2)
    assert.strictEqual(result.events[0]!.type, 'pageTransition')
    assert.strictEqual(result.events[0]!.to, '/products')
    assert.strictEqual(result.events[1]!.type, 'click')
    assert.strictEqual(result.events[1]!.label, '"Widget Pro" link')
  })
})

describe('executeTool — getEvents — PointerMove/Down/Up excluded', () => {
  it('excludes PointerMove, PointerDown, PointerUp at all tiers', async () => {
    const events = [
      makePointerMoveEvent(100),
      makePointerDownEvent(200),
      makePointerUpEvent(300),
      makeClickEvent(400, 'button'),
    ]
    const accessor = makeAccessor(events)

    for (const detail of ['summary', 'normal', 'full'] as const) {
      const result = (await runFuture(
        executeTool(accessor, 'getEvents', { detail })
      )) as {
        events?: Array<Record<string, unknown>>
        counts?: Record<string, number>
        totalEvents?: number
      }
      if (detail === 'summary') {
        assert.ok(!result.counts?.['pointerMove'])
        assert.ok(!result.counts?.['pointerDown'])
        assert.ok(!result.counts?.['pointerUp'])
      } else {
        assert.ok(
          result.events!.every(
            e =>
              e.type !== 'pointerMove' &&
              e.type !== 'pointerDown' &&
              e.type !== 'pointerUp'
          )
        )
      }
    }
  })
})

describe('executeTool — getEvents — KeyDown coalescing', () => {
  it('coalesces sequential KeyDown events into typed string at normal tier', async () => {
    const events = [
      makeKeyDownEvent(1000, 'd'),
      makeKeyDownEvent(1050, 'i'),
      makeKeyDownEvent(1100, 's'),
      makeKeyDownEvent(1150, 'c'),
    ]
    const accessor = makeAccessor(events)
    const result = (await runFuture(
      executeTool(accessor, 'getEvents', { detail: 'normal' })
    )) as {
      events: Array<Record<string, unknown>>
    }
    assert.strictEqual(result.events.length, 1)
    assert.strictEqual(result.events[0]!.type, 'typed')
    assert.strictEqual(result.events[0]!.text, 'disc')
  })

  it('returns individual keyDown events at full tier', async () => {
    const events = [makeKeyDownEvent(1000, 'a'), makeKeyDownEvent(1050, 'b')]
    const accessor = makeAccessor(events)
    const result = (await runFuture(
      executeTool(accessor, 'getEvents', { detail: 'full' })
    )) as {
      events: Array<Record<string, unknown>>
    }
    assert.strictEqual(result.events.length, 2)
    assert.strictEqual(result.events[0]!.type, 'keyDown')
    assert.strictEqual(result.events[0]!.key, 'a')
    assert.strictEqual(result.events[1]!.type, 'keyDown')
    assert.strictEqual(result.events[1]!.key, 'b')
  })

  it('excludes KeyDown events at summary tier', async () => {
    const events = [makeKeyDownEvent(1000, 'x'), makeKeyDownEvent(1050, 'y')]
    const accessor = makeAccessor(events)
    const result = (await runFuture(
      executeTool(accessor, 'getEvents', {
        detail: 'summary',
      })
    )) as {
      counts: Record<string, number>
      totalEvents: number
    }
    assert.strictEqual(result.totalEvents, 0)
    assert.ok(!result.counts['keyDown'])
    assert.ok(!result.counts['typed'])
  })

  it('wraps special keys in brackets at normal tier', async () => {
    const events = [
      makeKeyDownEvent(1000, 'Enter'),
      makeKeyDownEvent(1050, 'Backspace'),
    ]
    const accessor = makeAccessor(events)
    const result = (await runFuture(
      executeTool(accessor, 'getEvents', { detail: 'normal' })
    )) as {
      events: Array<Record<string, unknown>>
    }
    assert.strictEqual(result.events[0]!.type, 'typed')
    assert.strictEqual(result.events[0]!.text, '[Enter][Backspace]')
  })
})

describe('executeTool — getEvents — Click with humanReadableLabel', () => {
  it('includes humanReadableLabel when present', async () => {
    const events = [makeClickEvent(500, 'Submit button')]
    const accessor = makeAccessor(events)
    const result = (await runFuture(
      executeTool(accessor, 'getEvents', { detail: 'normal' })
    )) as {
      events: Array<Record<string, unknown>>
    }
    assert.strictEqual(result.events[0]!.label, 'Submit button')
    assert.ok(!('at' in result.events[0]!))
  })

  it('includes at coordinates at full tier', async () => {
    const events = [makeClickEvent(500, 'Submit', [150, 250])]
    const accessor = makeAccessor(events)
    const result = (await runFuture(
      executeTool(accessor, 'getEvents', { detail: 'full' })
    )) as {
      events: Array<Record<string, unknown>>
    }
    assert.deepStrictEqual(result.events[0]!.at, { x: 150, y: 250 })
  })

  it('omits label when null', async () => {
    const events = [makeClickEvent(500, null)]
    const accessor = makeAccessor(events)
    const result = (await runFuture(
      executeTool(accessor, 'getEvents', { detail: 'normal' })
    )) as {
      events: Array<Record<string, unknown>>
    }
    assert.ok(!('label' in result.events[0]!))
  })
})

describe('executeTool — getEvents — DOM patches bucketed', () => {
  it('buckets DOM patches into per-second windows', async () => {
    const events = [
      makeDOMPatchEvent(100),
      makeDOMPatchEvent(500),
      makeDOMPatchEvent(1200),
      makeDOMPatchEvent(1800),
      makeDOMPatchEvent(1900),
    ]
    const accessor = makeAccessor(events)
    const result = (await runFuture(
      executeTool(accessor, 'getEvents', { detail: 'normal' })
    )) as {
      events: Array<Record<string, unknown>>
      domActivity: Array<{ window: string; patchCount: number }>
    }
    assert.ok(Array.isArray(result.domActivity))
    const bucket0 = result.domActivity.find(b => b.window === '0-1s')
    const bucket1 = result.domActivity.find(b => b.window === '1-2s')
    assert.ok(bucket0)
    assert.strictEqual(bucket0.patchCount, 2)
    assert.ok(bucket1)
    assert.strictEqual(bucket1.patchCount, 3)
  })
})

describe('executeTool — getEvents — time range filtering', () => {
  it('filters events by startTimeMs', async () => {
    const events = [
      makePageTransitionEvent(100, '/early'),
      makePageTransitionEvent(500, '/mid'),
      makePageTransitionEvent(1000, '/late'),
    ]
    const accessor = makeAccessor(events)
    const result = (await runFuture(
      executeTool(accessor, 'getEvents', { startTimeMs: 400 })
    )) as {
      events: Array<Record<string, unknown>>
    }
    assert.strictEqual(result.events.length, 2)
    assert.strictEqual(result.events[0]!.to, '/mid')
  })

  it('filters events by endTimeMs', async () => {
    const events = [
      makePageTransitionEvent(100, '/early'),
      makePageTransitionEvent(500, '/mid'),
      makePageTransitionEvent(1000, '/late'),
    ]
    const accessor = makeAccessor(events)
    const result = (await runFuture(
      executeTool(accessor, 'getEvents', { endTimeMs: 600 })
    )) as {
      events: Array<Record<string, unknown>>
    }
    assert.strictEqual(result.events.length, 2)
    assert.strictEqual(result.events[1]!.to, '/mid')
  })
})

describe('executeTool — getEvents — eventTypes filter', () => {
  it('filters to only specified event types', async () => {
    const events = [
      makePageTransitionEvent(100, '/page'),
      makeClickEvent(200, 'button'),
      makeScrollEvent(300),
    ]
    const accessor = makeAccessor(events)
    const result = (await runFuture(
      executeTool(accessor, 'getEvents', {
        eventTypes: ['click'],
      })
    )) as {
      events: Array<Record<string, unknown>>
    }
    assert.strictEqual(result.events.length, 1)
    assert.strictEqual(result.events[0]!.type, 'click')
  })
})

describe('executeTool — getEvents — limit and hasMore', () => {
  it('truncates results and sets hasMore when limit exceeded', async () => {
    const events = [
      makePageTransitionEvent(100, '/a'),
      makePageTransitionEvent(200, '/b'),
      makePageTransitionEvent(300, '/c'),
      makePageTransitionEvent(400, '/d'),
      makePageTransitionEvent(500, '/e'),
    ]
    const accessor = makeAccessor(events)
    const result = (await runFuture(
      executeTool(accessor, 'getEvents', { limit: 2 })
    )) as {
      events: Array<Record<string, unknown>>
      hasMore: boolean
    }
    assert.strictEqual(result.events.length, 2)
    assert.strictEqual(result.hasMore, true)
  })

  it('does not set hasMore when results fit within limit', async () => {
    const events = [
      makePageTransitionEvent(100, '/a'),
      makePageTransitionEvent(200, '/b'),
    ]
    const accessor = makeAccessor(events)
    const result = (await runFuture(
      executeTool(accessor, 'getEvents', { limit: 10 })
    )) as {
      events: Array<Record<string, unknown>>
      hasMore?: boolean
    }
    assert.strictEqual(result.events.length, 2)
    assert.strictEqual(result.hasMore, undefined)
  })
})

describe('executeTool — getEvents — summary tier', () => {
  it('returns counts object not individual events at summary tier', async () => {
    const events = [
      makePageTransitionEvent(100, '/a'),
      makeClickEvent(200, 'button'),
      makeClickEvent(300, 'link'),
      makeDOMPatchEvent(400),
    ]
    const accessor = makeAccessor(events, 5000)
    const result = (await runFuture(
      executeTool(accessor, 'getEvents', {
        detail: 'summary',
      })
    )) as {
      totalEvents: number
      counts: Record<string, number>
      durationMs: number
      _tokenEstimate: number
    }
    assert.ok(!('events' in result))
    assert.strictEqual(result.counts['pageTransition'], 1)
    assert.strictEqual(result.counts['click'], 2)
    assert.strictEqual(result.counts['domPatch'], 1)
    assert.strictEqual(result.totalEvents, 4)
    assert.strictEqual(result.durationMs, 5000)
    assert.ok(typeof result._tokenEstimate === 'number')
  })
})

describe('executeTool — getEvents — scroll event', () => {
  it('includes target and to at normal tier', async () => {
    const events = [makeScrollEvent(500, '00042' as NodeId, [0, 0], [0, 400])]
    const accessor = makeAccessor(events)
    const result = (await runFuture(
      executeTool(accessor, 'getEvents', { detail: 'normal' })
    )) as {
      events: Array<Record<string, unknown>>
    }
    const ev = result.events[0]!
    assert.strictEqual(ev.type, 'scroll')
    assert.ok('target' in ev)
    assert.deepStrictEqual(ev.to, { x: 0, y: 400 })
    assert.ok(!('from' in ev))
  })

  it('includes from and to at full tier', async () => {
    const events = [makeScrollEvent(500, '00042' as NodeId, [0, 100], [0, 400])]
    const accessor = makeAccessor(events)
    const result = (await runFuture(
      executeTool(accessor, 'getEvents', { detail: 'full' })
    )) as {
      events: Array<Record<string, unknown>>
    }
    const ev = result.events[0]!
    assert.deepStrictEqual(ev.from, { x: 0, y: 100 })
    assert.deepStrictEqual(ev.to, { x: 0, y: 400 })
  })
})

describe('executeTool — getEvents — pageTransition', () => {
  it('includes from and to when from is set', async () => {
    const events = [makePageTransitionEvent(500, '/next', '/current')]
    const accessor = makeAccessor(events)
    const result = (await runFuture(
      executeTool(accessor, 'getEvents', {})
    )) as {
      events: Array<Record<string, unknown>>
    }
    const ev = result.events[0]!
    assert.strictEqual(ev.from, '/current')
    assert.strictEqual(ev.to, '/next')
  })

  it('omits from when null', async () => {
    const events = [makePageTransitionEvent(500, '/initial', null)]
    const accessor = makeAccessor(events)
    const result = (await runFuture(
      executeTool(accessor, 'getEvents', {})
    )) as {
      events: Array<Record<string, unknown>>
    }
    const ev = result.events[0]!
    assert.ok(!('from' in ev))
    assert.strictEqual(ev.to, '/initial')
  })
})

describe('executeTool — getEvents — viewportResize', () => {
  it('returns to dimensions at normal tier', async () => {
    const events = [makeViewportResizeEvent(500, [1024, 768], [800, 600])]
    const accessor = makeAccessor(events)
    const result = (await runFuture(
      executeTool(accessor, 'getEvents', { detail: 'normal' })
    )) as {
      events: Array<Record<string, unknown>>
    }
    const ev = result.events[0]!
    assert.strictEqual(ev.type, 'viewportResize')
    assert.deepStrictEqual(ev.to, { width: 800, height: 600 })
    assert.ok(!('from' in ev))
  })

  it('returns from and to at full tier', async () => {
    const events = [makeViewportResizeEvent(500, [1024, 768], [800, 600])]
    const accessor = makeAccessor(events)
    const result = (await runFuture(
      executeTool(accessor, 'getEvents', { detail: 'full' })
    )) as {
      events: Array<Record<string, unknown>>
    }
    const ev = result.events[0]!
    assert.deepStrictEqual(ev.from, { width: 1024, height: 768 })
    assert.deepStrictEqual(ev.to, { width: 800, height: 600 })
  })
})

describe('executeTool — getEvents — doubleClick', () => {
  it('returns doubleClick event with label at normal tier', async () => {
    const events = [makeDoubleClickEvent(700, 'image')]
    const accessor = makeAccessor(events)
    const result = (await runFuture(
      executeTool(accessor, 'getEvents', { detail: 'normal' })
    )) as {
      events: Array<Record<string, unknown>>
    }
    const ev = result.events[0]!
    assert.strictEqual(ev.type, 'doubleClick')
    assert.strictEqual(ev.label, 'image')
  })
})

describe('executeTool — getEvents — endTimeMs and duration fallback', () => {
  it('returns events when endTimeMs is omitted and getDuration returns zero', async () => {
    const events = [
      makePageTransitionEvent(100, '/a'),
      makePageTransitionEvent(500, '/b'),
    ]
    const accessor: RecordingDataAccessor = {
      getDuration: () => 0,
      getSnapshotAtTime: () => resolve(null),
      getResourceMap: () => resolve({}),
      ...makeAccessorFromEventList({
        size: () => events.length,
        over: i => events[i] ?? null,
      }),
    }
    const result = (await runFuture(
      executeTool(accessor, 'getEvents', {})
    )) as {
      events: Array<Record<string, unknown>>
    }
    assert.strictEqual(result.events.length, 2)
  })

  it('uses explicit endTimeMs when provided even if getDuration is zero', async () => {
    const events = [
      makePageTransitionEvent(100, '/a'),
      makePageTransitionEvent(500, '/b'),
      makePageTransitionEvent(900, '/c'),
    ]
    const accessor: RecordingDataAccessor = {
      getDuration: () => 0,
      getSnapshotAtTime: () => resolve(null),
      getResourceMap: () => resolve({}),
      ...makeAccessorFromEventList({
        size: () => events.length,
        over: i => events[i] ?? null,
      }),
    }
    const result = (await runFuture(
      executeTool(accessor, 'getEvents', { endTimeMs: 600 })
    )) as {
      events: Array<Record<string, unknown>>
    }
    assert.strictEqual(result.events.length, 2)
    assert.strictEqual(result.events[1]!.to, '/b')
  })

  it('uses getDuration as upper bound when positive and endTimeMs is omitted', async () => {
    const events = [
      makePageTransitionEvent(100, '/a'),
      makePageTransitionEvent(500, '/b'),
      makePageTransitionEvent(900, '/c'),
    ]
    const accessor: RecordingDataAccessor = {
      getDuration: () => 700,
      getSnapshotAtTime: () => resolve(null),
      getResourceMap: () => resolve({}),
      ...makeAccessorFromEventList({
        size: () => events.length,
        over: i => events[i] ?? null,
      }),
    }
    const result = (await runFuture(
      executeTool(accessor, 'getEvents', {})
    )) as {
      events: Array<Record<string, unknown>>
    }
    assert.strictEqual(result.events.length, 2)
    assert.strictEqual(result.events[1]!.to, '/b')
  })
})

// ─── Change 1: meta.node element extraction ───────────────────────────────────

describe('executeTool — getEvents — click element at detail=full', () => {
  it('includes element with nodeId, tagName, attributes (nulls filtered) at full tier', async () => {
    const events = [
      makeClickEvent(
        500,
        null,
        [100, 200],
        {
          id: 'node-42',
          tagName: 'button',
          attributes: { class: 'btn', 'data-foo': null },
        },
        []
      ),
    ]
    const accessor = makeAccessor(events)
    const result = (await runFuture(
      executeTool(accessor, 'getEvents', { detail: 'full' })
    )) as {
      events: Array<Record<string, unknown>>
    }
    const ev = result.events[0]!
    assert.ok('element' in ev, 'should have element field')
    const element = ev.element as Record<string, unknown>
    assert.strictEqual(element.nodeId, 'node-42')
    assert.strictEqual(element.tagName, 'button')
    assert.deepStrictEqual(element.attributes, { class: 'btn' })
  })

  it('includes targets when non-empty at full tier', async () => {
    const events = [
      makeClickEvent(500, null, [100, 200], undefined, ['node-1', 'node-2']),
    ]
    const accessor = makeAccessor(events)
    const result = (await runFuture(
      executeTool(accessor, 'getEvents', { detail: 'full' })
    )) as {
      events: Array<Record<string, unknown>>
    }
    const ev = result.events[0]!
    assert.ok('targets' in ev, 'should have targets field')
    assert.deepStrictEqual(ev.targets, ['node-1', 'node-2'])
  })

  it('omits targets when empty at full tier', async () => {
    const events = [makeClickEvent(500, null, [100, 200], undefined, [])]
    const accessor = makeAccessor(events)
    const result = (await runFuture(
      executeTool(accessor, 'getEvents', { detail: 'full' })
    )) as {
      events: Array<Record<string, unknown>>
    }
    const ev = result.events[0]!
    assert.ok(!('targets' in ev), 'should NOT have targets field when empty')
  })

  it('includes element for doubleClick at full tier', async () => {
    const events = [
      makeDoubleClickEvent(
        700,
        null,
        [50, 60],
        { id: 'node-99', tagName: 'img', attributes: { src: 'photo.jpg' } },
        []
      ),
    ]
    const accessor = makeAccessor(events)
    const result = (await runFuture(
      executeTool(accessor, 'getEvents', { detail: 'full' })
    )) as {
      events: Array<Record<string, unknown>>
    }
    const ev = result.events[0]!
    assert.strictEqual(ev.type, 'doubleClick')
    assert.ok('element' in ev, 'should have element field for doubleClick')
    const element = ev.element as Record<string, unknown>
    assert.strictEqual(element.nodeId, 'node-99')
    assert.strictEqual(element.tagName, 'img')
  })

  it('does NOT include element or targets at normal tier', async () => {
    const events = [
      makeClickEvent(
        500,
        null,
        [100, 200],
        { id: 'node-42', tagName: 'button', attributes: {} },
        ['node-1']
      ),
    ]
    const accessor = makeAccessor(events)
    const result = (await runFuture(
      executeTool(accessor, 'getEvents', { detail: 'normal' })
    )) as {
      events: Array<Record<string, unknown>>
    }
    const ev = result.events[0]!
    assert.ok(!('element' in ev), 'should NOT have element at normal tier')
    assert.ok(!('targets' in ev), 'should NOT have targets at normal tier')
  })
})
