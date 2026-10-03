import { RecordingMode } from '@repro/domain'
import { resolve } from 'fluture'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createUploadWorker } from './createUploadWorker'

describe('createUploadWorker description payload', () => {
  for (const description of ['The checkout button does nothing.', '']) {
    it(`forwards description ${JSON.stringify(description)} unchanged`, () => {
      const requests: Array<{
        path: string
        options?: { method?: string; body?: string }
      }> = []
      const apiClient = {
        fetch: (path: string, options?: { method?: string; body?: string }) => {
          requests.push({ path, options })
          return options?.method === 'POST'
            ? resolve({ id: 'recording-1' })
            : resolve(undefined)
        },
      }
      const uploadWorker = createUploadWorker(apiClient as never)

      uploadWorker.enqueue({
        projectId: 'project-1',
        title: 'Checkout is broken',
        description,
        url: 'https://example.com/checkout',
        mode: RecordingMode.Replay,
        duration: 1_000,
        events: [],
        browserName: 'Chrome',
        browserVersion: '120.0.0',
        operatingSystem: 'macOS',
      })

      const createRequest = requests.find(
        request => request.path === '/projects/project-1/recordings'
      )
      assert.ok(createRequest)
      assert.equal(createRequest.options?.method, 'POST')
      const body = JSON.parse(createRequest.options?.body ?? '{}')
      assert.equal(body.title, 'Checkout is broken')
      assert.equal(body.description, description)
    })
  }
})
