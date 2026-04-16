import { AGENTIC_DEFAULT_MODEL } from '@repro/domain'
import expect from 'expect'
import { promise, resolve } from 'fluture'
import { Readable } from 'node:stream'
import { describe, it } from 'node:test'
import { Dispatcher } from 'undici'
import { HttpClient } from '~/modules/http'
import { AgenticLogger, createAgenticService } from './agentic'

const noopLogger: AgenticLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
}

function makeStubHttpClient(chunks: string[]): HttpClient {
  return {
    request: <T>(options: Dispatcher.RequestOptions<T>) => {
      void options
      return resolve({
        statusCode: 200,
        headers: {},
        trailers: {},
        opaque: null,
        context: null,
        body: Readable.from(chunks),
      } as unknown as Dispatcher.ResponseData<T>)
    },
  }
}

describe('Services > Agentic', () => {
  describe('getStreamingResponse', () => {
    it('uses AGENTIC_DEFAULT_MODEL when no model override is provided', async () => {
      let capturedBody: Record<string, unknown> | null = null

      const stubHttpClient: HttpClient = {
        request: <T>(options: Dispatcher.RequestOptions<T>) => {
          const body = options.body
          if (typeof body === 'string') {
            capturedBody = JSON.parse(body) as Record<string, unknown>
          }
          return resolve({
            statusCode: 200,
            headers: {},
            trailers: {},
            opaque: null,
            context: null,
            body: Readable.from(['data: [DONE]\n\n']),
          } as unknown as Dispatcher.ResponseData<T>)
        },
      }

      const service = createAgenticService(null as never, stubHttpClient)

      const stream: Readable = await promise(
        service.getStreamingResponse(
          [{ role: 'user', content: 'hello' }],
          [],
          undefined,
          'conv-123',
          noopLogger
        )
      )

      // Drain the stream so 'end' fires and cleanup happens
      await new Promise(res => stream.on('end', res).resume())

      expect(capturedBody).not.toBeNull()
      expect(
        (capturedBody as unknown as Record<string, unknown>).model
      ).toEqual(AGENTIC_DEFAULT_MODEL)
    })

    it('emits agentic.token_usage log when final SSE chunk contains usage', async () => {
      const loggedEvents: Array<Record<string, unknown>> = []

      const testLogger: AgenticLogger = {
        info: (payload: Record<string, unknown>) => {
          loggedEvents.push(payload)
        },
        warn: () => undefined,
        error: () => undefined,
      }

      const usageChunk = JSON.stringify({
        choices: [],
        usage: { prompt_tokens: 100, completion_tokens: 50 },
      })

      const stubHttpClient = makeStubHttpClient([
        `data: ${usageChunk}\n\n`,
        'data: [DONE]\n\n',
      ])

      const service = createAgenticService(null as never, stubHttpClient)

      const stream: Readable = await promise(
        service.getStreamingResponse([], [], undefined, 'conv-abc', testLogger)
      )

      await new Promise(res => stream.on('end', res).resume())

      const tokenEvent = loggedEvents.find(
        e => e['event'] === 'agentic.token_usage'
      )
      expect(tokenEvent).toBeDefined()
      expect(tokenEvent?.['conversation_id']).toEqual('conv-abc')
      expect(tokenEvent?.['prompt_tokens']).toEqual(100)
      expect(tokenEvent?.['completion_tokens']).toEqual(50)
      expect(typeof tokenEvent?.['cost_estimate_usd']).toEqual('number')
    })

    it('emits agentic.latency log on stream end', async () => {
      const loggedEvents: Array<Record<string, unknown>> = []

      const testLogger: AgenticLogger = {
        info: (payload: Record<string, unknown>) => {
          loggedEvents.push(payload)
        },
        warn: () => undefined,
        error: () => undefined,
      }

      const stubHttpClient = makeStubHttpClient(['data: [DONE]\n\n'])
      const service = createAgenticService(null as never, stubHttpClient)

      const stream: Readable = await promise(
        service.getStreamingResponse(
          [],
          [],
          undefined,
          'conv-latency',
          testLogger
        )
      )

      await new Promise(res => stream.on('end', res).resume())

      const latencyEvent = loggedEvents.find(
        e => e['event'] === 'agentic.latency'
      )
      expect(latencyEvent).toBeDefined()
      expect(latencyEvent?.['conversation_id']).toEqual('conv-latency')
      expect(typeof latencyEvent?.['total_round_trip_ms']).toEqual('number')
    })

    it('emits agentic.tool_depth log when tool calls are present', async () => {
      const loggedEvents: Array<Record<string, unknown>> = []

      const testLogger: AgenticLogger = {
        info: (payload: Record<string, unknown>) => {
          loggedEvents.push(payload)
        },
        warn: () => undefined,
        error: () => undefined,
      }

      const toolCallChunk = JSON.stringify({
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  id: 'call-1',
                  function: { name: 'getDOMState', arguments: '' },
                },
                {
                  id: 'call-2',
                  function: { name: 'getElementDetails', arguments: '' },
                },
              ],
            },
          },
        ],
      })

      const stubHttpClient = makeStubHttpClient([
        `data: ${toolCallChunk}\n\n`,
        'data: [DONE]\n\n',
      ])

      const service = createAgenticService(null as never, stubHttpClient)

      const stream: Readable = await promise(
        service.getStreamingResponse(
          [],
          [],
          undefined,
          'conv-depth',
          testLogger
        )
      )

      await new Promise(res => stream.on('end', res).resume())

      const depthEvent = loggedEvents.find(
        e => e['event'] === 'agentic.tool_depth'
      )
      expect(depthEvent).toBeDefined()
      expect(depthEvent?.['conversation_id']).toEqual('conv-depth')
      expect(depthEvent?.['tool_call_count']).toEqual(2)
    })
  })

  describe('logNodeIdValidity', () => {
    it('logs valid=true when result does not contain node not found', () => {
      const loggedEvents: Array<Record<string, unknown>> = []
      const testLogger: AgenticLogger = {
        info: (payload: Record<string, unknown>) => loggedEvents.push(payload),
        warn: () => undefined,
        error: () => undefined,
      }

      const service = createAgenticService(null as never, null as never)
      service.logNodeIdValidity(
        testLogger,
        'conv-node-valid',
        'getDOMState',
        'node-42',
        '{"tag":"div"}'
      )

      const event = loggedEvents.find(
        e => e['event'] === 'agentic.nodeid_validity'
      )
      expect(event).toBeDefined()
      expect(event?.['valid']).toEqual(true)
      expect(event?.['node_id']).toEqual('node-42')
      expect(event?.['conversation_id']).toEqual('conv-node-valid')
    })

    it('logs valid=false when result contains "node not found"', () => {
      const loggedEvents: Array<Record<string, unknown>> = []
      const testLogger: AgenticLogger = {
        info: (payload: Record<string, unknown>) => loggedEvents.push(payload),
        warn: () => undefined,
        error: () => undefined,
      }

      const service = createAgenticService(null as never, null as never)
      service.logNodeIdValidity(
        testLogger,
        'conv-node-invalid',
        'getDOMState',
        'node-99',
        'error: node not found'
      )

      const event = loggedEvents.find(
        e => e['event'] === 'agentic.nodeid_validity'
      )
      expect(event).toBeDefined()
      expect(event?.['valid']).toEqual(false)
    })

    it('does not log for non-DOM tools', () => {
      const loggedEvents: Array<Record<string, unknown>> = []
      const testLogger: AgenticLogger = {
        info: (payload: Record<string, unknown>) => loggedEvents.push(payload),
        warn: () => undefined,
        error: () => undefined,
      }

      const service = createAgenticService(null as never, null as never)
      service.logNodeIdValidity(
        testLogger,
        'conv-noop',
        'captureScreenshot',
        'node-1',
        'some result'
      )

      const event = loggedEvents.find(
        e => e['event'] === 'agentic.nodeid_validity'
      )
      expect(event).toBeUndefined()
    })
  })

  describe('logToolResult', () => {
    it('logs tool result with success=true', () => {
      const loggedEvents: Array<Record<string, unknown>> = []
      const testLogger: AgenticLogger = {
        info: (payload: Record<string, unknown>) => loggedEvents.push(payload),
        warn: () => undefined,
        error: () => undefined,
      }

      const service = createAgenticService(null as never, null as never)
      service.logToolResult(testLogger, 'conv-1', 'getDOMState', true, 42)

      const event = loggedEvents.find(
        (e: Record<string, unknown>) => e['event'] === 'agentic.tool_result'
      )
      expect(event).toBeDefined()
      expect(event?.['tool_name']).toEqual('getDOMState')
      expect(event?.['success']).toEqual(true)
      expect(event?.['duration_ms']).toEqual(42)
    })

    it('logs tool result with error_type when provided', () => {
      const loggedEvents: Array<Record<string, unknown>> = []
      const testLogger: AgenticLogger = {
        info: (payload: Record<string, unknown>) => loggedEvents.push(payload),
        warn: () => undefined,
        error: () => undefined,
      }

      const service = createAgenticService(null as never, null as never)
      service.logToolResult(
        testLogger,
        'conv-1',
        'getDOMState',
        false,
        10,
        'TimeoutError'
      )

      const event = loggedEvents.find(
        (e: Record<string, unknown>) => e['event'] === 'agentic.tool_result'
      )
      expect(event?.['success']).toEqual(false)
      expect(event?.['error_type']).toEqual('TimeoutError')
    })
  })
})
