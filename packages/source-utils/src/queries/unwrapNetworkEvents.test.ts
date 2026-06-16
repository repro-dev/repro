import {
  NetworkEvent,
  NetworkMessageType,
  RequestType,
  SourceEvent,
} from '@repro/domain'
import { Box } from '@repro/tdl'
import assert from 'node:assert'
import { describe, it } from 'node:test'
import { unwrapNetworkEvents } from './unwrapNetworkEvents'

function makeFetchRequestEvent(
  time: number,
  correlationId: string,
  url: string,
  method: string
): Box<NetworkEvent> {
  return new Box({
    type: 4, // SourceEventType.Network
    time,
    data: {
      type: NetworkMessageType.FetchRequest,
      correlationId,
      requestType: RequestType.Fetch,
      url,
      method,
      headers: {},
      body: new ArrayBuffer(0),
    },
  } as unknown as NetworkEvent)
}

describe('unwrapNetworkEvents', () => {
  it('returns empty array for empty input', () => {
    const result = unwrapNetworkEvents([])
    assert.strictEqual(result.length, 0)
  })

  it('unwraps a single network event', () => {
    const events = [
      makeFetchRequestEvent(100, 'req1', 'https://example.com', 'GET'),
    ]
    const result = unwrapNetworkEvents(events as SourceEvent[])
    assert.strictEqual(result.length, 1)
    const [networkEvent, index] = result[0]!
    assert.strictEqual(index, 0)
    assert.strictEqual(networkEvent.time, 100)
    assert.strictEqual(networkEvent.type, 4) // SourceEventType.Network
  })

  it('unwraps multiple network events', () => {
    const events = [
      makeFetchRequestEvent(100, 'req1', 'https://example.com/a', 'GET'),
      makeFetchRequestEvent(200, 'req2', 'https://example.com/b', 'POST'),
      makeFetchRequestEvent(300, 'req3', 'https://example.com/c', 'PUT'),
    ]
    const result = unwrapNetworkEvents(events as SourceEvent[])
    assert.strictEqual(result.length, 3)
    result.forEach(([_, idx]) => {
      assert.strictEqual(idx, 0)
    })
    assert.strictEqual(result[0]![0].time, 100)
    assert.strictEqual(result[1]![0].time, 200)
    assert.strictEqual(result[2]![0].time, 300)
  })
})
