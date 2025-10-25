import { ReadableStream } from '@repro/stream-utils'
import { attemptP, bichain, chain, FutureInstance, map, resolve } from 'fluture'
import nativeFetch from 'isomorphic-unfetch'
import { AuthStore } from './auth'
import { ApiConfiguration, Fetch, FetchOptions } from './types'

export function createDefaultRequestOptions(
  authStore: AuthStore,
  requestType: 'json' | 'binary',
  hasRequestBody: boolean
) {
  return authStore
    .getSessionToken()
    .pipe(bichain(() => resolve(''))(resolve))
    .pipe(
      map(
        token =>
          ({
            cache: 'no-store',
            credentials: 'include',
            headers: {
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
              ...(requestType === 'json' && hasRequestBody
                ? { 'Content-Type': 'application/json' }
                : {}),
            },
            method: 'GET',
          }) as const
      )
    )
}

export function createFetch(
  authStore: AuthStore,
  config: ApiConfiguration,
  fetchImpl = nativeFetch
): Fetch {
  return function fetch<R = any>(
    url: string,
    options: FetchOptions = {},
    requestType: 'json' | 'binary' = 'json',
    responseType: 'auto' | 'json' | 'binary' | 'text' | 'stream' = 'auto'
  ): FutureInstance<Error, R> {
    const reqOptions = createDefaultRequestOptions(
      authStore,
      requestType,
      options.body != null
    )

    const res = reqOptions.pipe(
      chain(reqOptions => {
        const init: RequestInit = {
          ...reqOptions,
          method: options.method ?? reqOptions.method,
          headers: { ...reqOptions.headers, ...options.headers },
          body: options.body,
        }

        return attemptP<Error, Response>(() => {
          return fetchImpl(
            url.startsWith('http:') || url.startsWith('https:')
              ? url
              : `${config.baseUrl}/${url.replace(/^\//, '')}`,
            init
          )
        })
      })
    )

    return res.pipe(
      chain<Error, Response, R>(res =>
        attemptP(async () => {
          if (responseType === 'stream') {
            // From https://developer.mozilla.org/en-US/docs/Web/API/Response/body:
            // > Note: Current browsers don't actually conform to the spec requirement
            // > to set the body property to null for responses with no body (for example,
            // > responses to HEAD requests, or 204 No Content responses).
            //
            // FIXME: Create empty ReadableStream if `res.body` is null
            return res.body as unknown as ReadableStream<Uint8Array>
          }

          const contentType = res.headers.get('content-type')

          let body: any

          if (responseType === 'auto') {
            if (!contentType) {
              body = await res.text()
            } else if (contentType.includes('application/json')) {
              body = await res.json()
            } else if (contentType.includes('application/octet-stream')) {
              body = new DataView(await res.arrayBuffer())
            } else if (contentType.includes('image/')) {
              body = new DataView(await res.arrayBuffer())
            } else {
              body = await res.text()
            }
          } else {
            if (responseType === 'json') {
              body = await res.json()
            } else if (responseType === 'text') {
              body = await res.text()
            } else {
              body = new DataView(await res.arrayBuffer())
            }
          }

          if (!res.ok) {
            throw body
          }

          return body
        })
      )
    )
  }
}
