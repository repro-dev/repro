import { ApiClient } from '@repro/api-client'
import { fork, reject as futureReject, resolve } from 'fluture'
import assert from 'node:assert'
import { describe, it } from 'node:test'
import { getResourceMap } from './queries'

// Minimal ApiClient stub — only `fetch` is exercised by queries.ts
function makeApiClient(
  fetchImpl: ApiClient['fetch']
): Pick<ApiClient, 'fetch'> {
  return { fetch: fetchImpl } as ApiClient
}

function runFuture<L, R>(
  fut: import('fluture').FutureInstance<L, R>
): Promise<R> {
  return new Promise((res, rej) => {
    fut.pipe(fork(rej)(res))
  })
}

describe('getResourceMap', () => {
  it('returns the resource map on success', async () => {
    const expected: Record<string, string> = {
      'https://example.com/style.css': 'data:text/css;base64,abc',
    }

    const client = makeApiClient(() => resolve(expected) as never)

    const result = await runFuture(
      getResourceMap(client as ApiClient, 'proj-1', 'rec-1')
    )

    assert.deepStrictEqual(result, expected)
  })

  it('fetches from the correct URL path', async () => {
    let capturedUrl = ''

    const client = makeApiClient((url: string) => {
      capturedUrl = url
      return resolve({}) as never
    })

    await runFuture(getResourceMap(client as ApiClient, 'my-project', 'my-rec'))

    assert.strictEqual(
      capturedUrl,
      '/projects/my-project/recordings/my-rec/resource-map'
    )
  })

  it('falls back to empty object when the fetch rejects (error path)', async () => {
    const client = makeApiClient(
      () => futureReject(new Error('network')) as never
    )

    // This is the critical correctness guarantee: errors must resolve to {}
    const result = await runFuture(
      getResourceMap(client as ApiClient, 'proj-1', 'rec-1')
    )

    assert.deepStrictEqual(result, {})
  })

  it('fallback empty object is the same reference (EMPTY_RESOURCE_MAP sentinel)', async () => {
    const client = makeApiClient(() => futureReject(new Error('404')) as never)

    const result1 = await runFuture(
      getResourceMap(client as ApiClient, 'p', 'r')
    )
    const result2 = await runFuture(
      getResourceMap(client as ApiClient, 'p', 'r')
    )

    // Both calls should resolve to equivalent empty objects
    assert.deepStrictEqual(result1, {})
    assert.deepStrictEqual(result2, {})
  })

  it('falls back to empty object regardless of the error type (HTTP status object)', async () => {
    const client = makeApiClient(
      () => futureReject({ status: 404, statusText: 'Not Found' }) as never
    )

    const result = await runFuture(
      getResourceMap(client as ApiClient, 'proj-1', 'rec-1')
    )

    assert.deepStrictEqual(result, {})
  })

  it('returns the resolved Future, not a plain object', () => {
    const client = makeApiClient(() => resolve({}) as never)
    const future = getResourceMap(client as ApiClient, 'p', 'r')

    // The return value must be a Future (has .pipe method)
    assert.strictEqual(typeof future.pipe, 'function')
  })
})
