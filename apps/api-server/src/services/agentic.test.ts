import { AGENTIC_DEFAULT_MODEL } from '@repro/domain'
import expect from 'expect'
import { promise, resolve } from 'fluture'
import { Readable } from 'node:stream'
import { describe, it } from 'node:test'
import { Dispatcher } from 'undici'
import { HttpClient } from '~/modules/http'
import { createAgenticService } from './agentic'

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

      await promise(
        service.getStreamingResponse(
          [{ role: 'user', content: 'hello' }],
          [],
          undefined
        )
      )

      expect(capturedBody).not.toBeNull()
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(
        (capturedBody as unknown as Record<string, unknown>).model
      ).toEqual(AGENTIC_DEFAULT_MODEL)
    })
  })
})
