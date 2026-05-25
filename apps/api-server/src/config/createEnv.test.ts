import expect from 'expect'
import { describe, it } from 'node:test'
import { createEnv } from './createEnv'

describe('Config > createEnv outbox worker values', () => {
  it('parses outbox worker defaults', () => {
    const env = createEnv({})

    expect(env.OUTBOX_WORKER_POLL_INTERVAL_MS).toEqual(1000)
    expect(env.OUTBOX_WORKER_BATCH_SIZE).toEqual(10)
    expect(env.OUTBOX_WORKER_DEFAULT_MAX_ATTEMPTS).toEqual(3)
    expect(env.OUTBOX_WORKER_RETRY_BASE_MS).toEqual(1000)
    expect(env.OUTBOX_WORKER_RETRY_MAX_MS).toEqual(60000)
    expect(env.OUTBOX_WORKER_STALE_AFTER_MS).toEqual(300000)
  })

  it('coerces numeric strings', () => {
    const env = createEnv({
      OUTBOX_WORKER_POLL_INTERVAL_MS: '2000',
      OUTBOX_WORKER_BATCH_SIZE: '5',
      OUTBOX_WORKER_DEFAULT_MAX_ATTEMPTS: '4',
      OUTBOX_WORKER_RETRY_BASE_MS: '250',
      OUTBOX_WORKER_RETRY_MAX_MS: '5000',
      OUTBOX_WORKER_STALE_AFTER_MS: '10000',
    })

    expect(env.OUTBOX_WORKER_POLL_INTERVAL_MS).toEqual(2000)
    expect(env.OUTBOX_WORKER_BATCH_SIZE).toEqual(5)
    expect(env.OUTBOX_WORKER_DEFAULT_MAX_ATTEMPTS).toEqual(4)
    expect(env.OUTBOX_WORKER_RETRY_BASE_MS).toEqual(250)
    expect(env.OUTBOX_WORKER_RETRY_MAX_MS).toEqual(5000)
    expect(env.OUTBOX_WORKER_STALE_AFTER_MS).toEqual(10000)
  })

  it('rejects non-positive worker values', () => {
    expect(() => createEnv({ OUTBOX_WORKER_BATCH_SIZE: '0' })).toThrow()
  })
})
