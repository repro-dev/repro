import { tap } from '@repro/future-utils'
import { ReadableStream, WritableStream } from '@repro/stream-utils'
import expect from 'expect'
import { chain, fork } from 'fluture'
import { afterEach, it } from 'node:test'
import { AuthStore } from '../auth'
import { ApiConfiguration, Fetch } from '../types'

export interface MockRequest {
  url: string
  method: string
  status: number
  requestHeaders?: Record<string, string>
  requestBody?: any
  responseHeaders?: Record<string, string>
  responseBody?: any
}

export interface TestSuiteOptions {
  createAuthStore: () => AuthStore
  createFetch: (
    authStore: AuthStore,
    config: ApiConfiguration,
    fetchImpl?: typeof fetch
  ) => Fetch
  fetchImplMock: typeof fetch
  addMock: (req: MockRequest) => void
  clearMocks: () => void
}

export const createFetchTestSuite = (options: TestSuiteOptions) => {
  const { createAuthStore, createFetch, fetchImplMock, addMock, clearMocks } =
    options

  return () => {
    afterEach(() => {
      clearMocks()
    })

    it('should make a request with the correct URL and options', async ctx => {
      addMock({
        url: 'https://api.example.com/test-endpoint',
        method: 'GET',
        status: 200,
        responseBody: { success: true, data: 'test-data' },
        responseHeaders: {
          'Content-Type': 'application/json',
        },
      })

      const authStore = createAuthStore()

      const config = {
        baseUrl: 'https://api.example.com',
        authStorage: 'memory' as const,
      }

      ctx.mock.module('isomorphic-unfetch', {
        defaultExport: fetchImplMock,
      })

      const fetchImpl = (await import('isomorphic-unfetch')).default
      const fetch = createFetch(authStore, config, fetchImpl)

      return new Promise<void>((resolve, reject) => {
        authStore
          .setSessionToken('test-token')
          .pipe(tap(token => expect(token).toEqual('test-token')))
          .pipe(chain(() => fetch('/test-endpoint')))
          .pipe(
            tap(res =>
              expect(res).toEqual({ success: true, data: 'test-data' })
            )
          )
          .pipe(fork(error => reject(error))(() => resolve(undefined)))
      })
    })

    it('should support streaming responses', async ctx => {
      addMock({
        url: 'https://api.example.com/test-endpoint',
        method: 'GET',
        status: 200,
        responseBody: new TextEncoder().encode('test-data'),
      })

      const authStore = createAuthStore()

      const config = {
        baseUrl: 'https://api.example.com',
        authStorage: 'memory' as const,
      }

      ctx.mock.module('isomorphic-unfetch', {
        defaultExport: fetchImplMock,
      })

      const fetchImpl = (await import('isomorphic-unfetch')).default
      const fetch = createFetch(authStore, config, fetchImpl)

      return new Promise<void>((resolve, reject) => {
        authStore
          .setSessionToken('test-token')
          .pipe(tap(token => expect(token).toEqual('test-token')))
          .pipe(
            chain(() =>
              fetch<ReadableStream<Uint8Array>>(
                '/test-endpoint',
                {},
                'json',
                'stream'
              )
            )
          )
          .pipe(
            fork(error => reject(error))(res => {
              res.pipeTo(
                new WritableStream({
                  close() {
                    resolve(undefined)
                  },
                })
              )
            })
          )
      })
    })
  }
}
