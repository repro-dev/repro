import { describe } from 'node:test'
import { createInMemoryAuthStore } from './auth'
import { createFetch } from './fetch'
import { MockRequest, createFetchTestSuite } from './test-suites/fetch'

describe('api-client: common', () => {
  describe('createFetch with isomorphic-unfetch', () => {
    let mocks: MockRequest[] = []

    function fetchImplMock(input: RequestInfo | URL, init?: RequestInit) {
      // TODO: Find matching mock request
      let url: string
      let method = 'GET'

      if (typeof input === 'string') {
        url = input
      } else if (input instanceof Request) {
        url = input.url
        method = input.method
      } else {
        url = input.toString()
      }

      if (init?.method) {
        method = init.method
      }

      for (const mock of mocks) {
        if (mock.url === url && mock.method === method) {
          let body = new ArrayBuffer(0)

          if (mock.responseBody) {
            if (mock.responseBody instanceof ArrayBuffer) {
              body = mock.responseBody
            } else if (typeof mock.responseBody === 'string') {
              body = new TextEncoder().encode(mock.responseBody)
            } else {
              body = new TextEncoder().encode(JSON.stringify(mock.responseBody))
            }
          }

          return Promise.resolve(
            new Response(body, {
              headers: mock.responseHeaders,
              status: mock.status,
            })
          )
        }
      }

      return Promise.reject(new Error('No matching mock'))
    }

    const testSuite = createFetchTestSuite({
      createAuthStore: createInMemoryAuthStore,
      createFetch,

      fetchImplMock,

      addMock: (req: MockRequest) => {
        mocks.push(req)
      },

      clearMocks: () => {
        mocks = []
      },
    })

    testSuite()
  })
})
