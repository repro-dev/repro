import { AGENTIC_DEFAULT_MODEL } from '@repro/domain'
import expect from 'expect'
import { promise, resolve } from 'fluture'
import { Readable } from 'node:stream'
import { describe, it } from 'node:test'
import { Dispatcher } from 'undici'
import { HttpClient } from '~/modules/http'
import { createAgenticService } from './agentic'

async function captureStreamingRequestBody(
  options: { modelId?: string } = {}
): Promise<Record<string, unknown>> {
  let capturedBody: Record<string, unknown> | null = null

  const stubHttpClient: HttpClient = {
    request: <T>(requestOptions: Dispatcher.RequestOptions<T>) => {
      const body = requestOptions.body
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

  const service = createAgenticService(null as never, stubHttpClient, options)

  await promise(
    service.getStreamingResponse(
      [{ role: 'user', content: 'hello' }],
      [
        {
          type: 'function',
          function: { name: 'getEvents', description: 'Read events' },
        },
      ],
      undefined
    )
  )

  expect(capturedBody).not.toBeNull()
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return capturedBody!
}

describe('Services > Agentic', () => {
  describe('getStreamingResponse', () => {
    it('uses the non-OpenAI default model without reasoning options', async () => {
      const body = await captureStreamingRequestBody()

      expect(body.model).toEqual(AGENTIC_DEFAULT_MODEL)
      expect(body.stream).toEqual(true)
      expect(body.tool_choice).toEqual('auto')
      expect(body.tools).toEqual([
        {
          type: 'function',
          function: { name: 'getEvents', description: 'Read events' },
        },
      ])
      expect(body).not.toHaveProperty('reasoning')
    })

    it('omits reasoning options for explicit non-OpenAI models', async () => {
      const body = await captureStreamingRequestBody({
        modelId: 'google/gemini-2.5-pro',
      })

      expect(body.model).toEqual('google/gemini-2.5-pro')
      expect(body).not.toHaveProperty('reasoning')
    })

    it('includes reasoning options for OpenAI models', async () => {
      const body = await captureStreamingRequestBody({ modelId: 'openai/o3' })

      expect(body.model).toEqual('openai/o3')
      expect(body.reasoning).toEqual({ effort: 'medium', exclude: true })
    })
  })
})
