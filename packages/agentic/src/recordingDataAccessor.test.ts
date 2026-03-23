import { SourceEvent, SourceEventType } from '@repro/domain'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { EventList, makeAccessorFromEventList } from './recordingDataAccessor'

type MockEventData = Record<string, unknown>

function makeBox<T>(value: T): {
  get: <K extends keyof T>(key: K) => ReturnType<typeof makeBox<T[K]>>
  orElse: <U>(other: U) => T | U
} {
  return {
    get: key => makeBox((value as MockEventData)[key as string] as T[typeof key]),
    orElse: other => (value == null ? other : value),
  }
}

type MockEvent = ReturnType<typeof makeBox<{ type: SourceEventType; time: number }>>

function makeEvent(type: SourceEventType, time: number): MockEvent {
  return makeBox({ type, time })
}

function makeConsoleEvent(time: number): MockEvent {
  return makeEvent(SourceEventType.Console, time)
}

function makeInteractionEvent(time: number): MockEvent {
  return makeEvent(SourceEventType.Interaction, time)
}

function makeNetworkEvent(time: number): MockEvent {
  return makeEvent(SourceEventType.Network, time)
}

function makeEventSource(events: MockEvent[]): EventList {
  return {
    size: () => events.length,
    over: (i: number) => events[i] as unknown as ReturnType<
      typeof import('@repro/domain').SourceEventView.from
    > | null,
  }
}

function getTime(event: SourceEvent): number {
  return (event as unknown as MockEvent).get('time').orElse(0)
}

function getType(event: SourceEvent): number {
  return (event as unknown as MockEvent).get('type').orElse(-1)
}

describe('makeAccessorFromEventList — getEventsByType', () => {
  it('returns empty array when source is empty', () => {
    const accessor = makeAccessorFromEventList(makeEventSource([]))
    const result = accessor.getEventsByType([SourceEventType.Console])
    assert.deepStrictEqual(result, [])
  })

  it('filters events by type', () => {
    const events = [
      makeConsoleEvent(100),
      makeInteractionEvent(200),
      makeConsoleEvent(300),
    ]
    const accessor = makeAccessorFromEventList(makeEventSource(events))
    const result = accessor.getEventsByType([SourceEventType.Console])
    assert.strictEqual(result.length, 2)
    assert.ok(result.every(e => getType(e) === SourceEventType.Console))
  })

  it('returns events matching any of multiple types', () => {
    const events = [
      makeConsoleEvent(100),
      makeInteractionEvent(200),
      makeNetworkEvent(300),
    ]
    const accessor = makeAccessorFromEventList(makeEventSource(events))
    const result = accessor.getEventsByType([
      SourceEventType.Console,
      SourceEventType.Network,
    ])
    assert.strictEqual(result.length, 2)
  })

  it('filters by startMs', () => {
    const events = [
      makeConsoleEvent(100),
      makeConsoleEvent(500),
      makeConsoleEvent(900),
    ]
    const accessor = makeAccessorFromEventList(makeEventSource(events))
    const result = accessor.getEventsByType([SourceEventType.Console], {
      startMs: 400,
    })
    assert.strictEqual(result.length, 2)
    assert.deepStrictEqual(result.map(getTime), [500, 900])
  })

  it('filters by endMs', () => {
    const events = [
      makeConsoleEvent(100),
      makeConsoleEvent(500),
      makeConsoleEvent(900),
    ]
    const accessor = makeAccessorFromEventList(makeEventSource(events))
    const result = accessor.getEventsByType([SourceEventType.Console], {
      endMs: 600,
    })
    assert.strictEqual(result.length, 2)
    assert.deepStrictEqual(result.map(getTime), [100, 500])
  })

  it('filters by both startMs and endMs', () => {
    const events = [
      makeConsoleEvent(100),
      makeConsoleEvent(500),
      makeConsoleEvent(900),
    ]
    const accessor = makeAccessorFromEventList(makeEventSource(events))
    const result = accessor.getEventsByType([SourceEventType.Console], {
      startMs: 200,
      endMs: 700,
    })
    assert.strictEqual(result.length, 1)
    assert.strictEqual(getTime(result[0]!), 500)
  })

  it('respects limit', () => {
    const events = Array.from({ length: 5 }, (_, i) => makeConsoleEvent((i + 1) * 100))
    const accessor = makeAccessorFromEventList(makeEventSource(events))
    const result = accessor.getEventsByType([SourceEventType.Console], {
      limit: 3,
    })
    assert.strictEqual(result.length, 3)
  })

  it('respects offset', () => {
    const events = Array.from({ length: 5 }, (_, i) => makeConsoleEvent((i + 1) * 100))
    const accessor = makeAccessorFromEventList(makeEventSource(events))
    const result = accessor.getEventsByType([SourceEventType.Console], {
      offset: 2,
    })
    assert.strictEqual(result.length, 3)
    assert.deepStrictEqual(result.map(getTime), [300, 400, 500])
  })

  it('applies offset before limit', () => {
    const events = Array.from({ length: 5 }, (_, i) => makeConsoleEvent((i + 1) * 100))
    const accessor = makeAccessorFromEventList(makeEventSource(events))
    const result = accessor.getEventsByType([SourceEventType.Console], {
      offset: 2,
      limit: 2,
    })
    assert.strictEqual(result.length, 2)
    assert.deepStrictEqual(result.map(getTime), [300, 400])
  })

  it('returns no events when type does not match anything', () => {
    const events = [makeConsoleEvent(100), makeInteractionEvent(200)]
    const accessor = makeAccessorFromEventList(makeEventSource(events))
    const result = accessor.getEventsByType([SourceEventType.Network])
    assert.deepStrictEqual(result, [])
  })
})

describe('makeAccessorFromEventList — getEventsInRange', () => {
  it('returns empty array when source is empty', () => {
    const accessor = makeAccessorFromEventList(makeEventSource([]))
    const result = accessor.getEventsInRange(0, 1000)
    assert.deepStrictEqual(result, [])
  })

  it('returns events within the time range', () => {
    const events = [
      makeConsoleEvent(100),
      makeConsoleEvent(500),
      makeConsoleEvent(900),
    ]
    const accessor = makeAccessorFromEventList(makeEventSource(events))
    const result = accessor.getEventsInRange(200, 700)
    assert.strictEqual(result.length, 1)
    assert.strictEqual(getTime(result[0]!), 500)
  })

  it('includes events at exact boundary times', () => {
    const events = [
      makeConsoleEvent(100),
      makeConsoleEvent(500),
      makeConsoleEvent(900),
    ]
    const accessor = makeAccessorFromEventList(makeEventSource(events))
    const result = accessor.getEventsInRange(100, 900)
    assert.strictEqual(result.length, 3)
  })

  it('filters by types when provided', () => {
    const events = [
      makeConsoleEvent(100),
      makeInteractionEvent(200),
      makeNetworkEvent(300),
    ]
    const accessor = makeAccessorFromEventList(makeEventSource(events))
    const result = accessor.getEventsInRange(0, 1000, {
      types: [SourceEventType.Console],
    })
    assert.strictEqual(result.length, 1)
    assert.strictEqual(getType(result[0]!), SourceEventType.Console)
  })

  it('respects limit', () => {
    const events = Array.from({ length: 5 }, (_, i) => makeConsoleEvent((i + 1) * 100))
    const accessor = makeAccessorFromEventList(makeEventSource(events))
    const result = accessor.getEventsInRange(0, 1000, { limit: 3 })
    assert.strictEqual(result.length, 3)
  })

  it('respects offset', () => {
    const events = Array.from({ length: 5 }, (_, i) => makeConsoleEvent((i + 1) * 100))
    const accessor = makeAccessorFromEventList(makeEventSource(events))
    const result = accessor.getEventsInRange(0, 1000, { offset: 2 })
    assert.strictEqual(result.length, 3)
    assert.deepStrictEqual(result.map(getTime), [300, 400, 500])
  })

  it('applies offset before limit', () => {
    const events = Array.from({ length: 5 }, (_, i) => makeConsoleEvent((i + 1) * 100))
    const accessor = makeAccessorFromEventList(makeEventSource(events))
    const result = accessor.getEventsInRange(0, 1000, { offset: 2, limit: 2 })
    assert.strictEqual(result.length, 2)
    assert.deepStrictEqual(result.map(getTime), [300, 400])
  })

  it('stops iterating after endMs (break optimization)', () => {
    const events = [
      makeConsoleEvent(100),
      makeConsoleEvent(200),
      makeConsoleEvent(800),
      makeConsoleEvent(900),
    ]
    const accessor = makeAccessorFromEventList(makeEventSource(events))
    const result = accessor.getEventsInRange(0, 300)
    assert.strictEqual(result.length, 2)
    assert.deepStrictEqual(result.map(getTime), [100, 200])
  })

  it('returns all event types when no types filter provided', () => {
    const events = [
      makeConsoleEvent(100),
      makeInteractionEvent(200),
      makeNetworkEvent(300),
    ]
    const accessor = makeAccessorFromEventList(makeEventSource(events))
    const result = accessor.getEventsInRange(0, 1000)
    assert.strictEqual(result.length, 3)
  })
})

describe('makeAccessorFromEventList — getEventsByType early exit', () => {
  it('stops iterating once time exceeds endMs (sorted list break optimization)', () => {
    let maxIndexVisited = -1
    const events = [
      makeConsoleEvent(100),
      makeConsoleEvent(200),
      makeConsoleEvent(800),
      makeConsoleEvent(900),
    ]
    const eventSource: EventList = {
      size: () => events.length,
      over: (i: number) => {
        if (i > maxIndexVisited) maxIndexVisited = i
        return events[i] as unknown as ReturnType<
          typeof import('@repro/domain').SourceEventView.from
        > | null
      },
    }
    const accessor = makeAccessorFromEventList(eventSource)
    const result = accessor.getEventsByType([SourceEventType.Console], {
      startMs: 50,
      endMs: 300,
    })
    assert.strictEqual(result.length, 2)
    assert.deepStrictEqual(result.map(getTime), [100, 200])
    assert.ok(maxIndexVisited < events.length - 1, 'should not visit all events')
  })

  it('skips events below startMs using continue, not break', () => {
    const events = [
      makeConsoleEvent(100),
      makeConsoleEvent(500),
      makeConsoleEvent(900),
    ]
    const accessor = makeAccessorFromEventList(makeEventSource(events))
    const result = accessor.getEventsByType([SourceEventType.Console], {
      startMs: 400,
      endMs: 1000,
    })
    assert.strictEqual(result.length, 2)
    assert.deepStrictEqual(result.map(getTime), [500, 900])
  })
})
