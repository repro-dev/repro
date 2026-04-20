import expect from 'expect'
import { promise, reject, resolve } from 'fluture'
import { Readable } from 'node:stream'
import { after, before, describe, it } from 'node:test'
import { Database } from '~/modules/database'
import { Storage } from '~/modules/storage'
import { setUpTestDatabase } from '~/testing/database'
import { createHealthService } from './health'

function createHealthyStorage(): Storage {
  return {
    exists: () => resolve(true),
    write: () => resolve(void 0),
    read: () => resolve(Readable.from(['ok'])),
    delete: () => resolve(void 0),
  }
}

describe('Services > Health', () => {
  let reset: () => Promise<void>
  let db: Database
  let storage: Storage

  before(async () => {
    const { db: dbInstance, close: closeDb } = await setUpTestDatabase()

    db = dbInstance
    storage = createHealthyStorage()

    reset = async () => {
      await closeDb()
    }
  })

  after(async () => {
    await reset()
  })

  it('should return ok when Redis is connected', async () => {
    const redisClient = { ping: async () => 'PONG' }
    const healthService = createHealthService(db, storage, redisClient)

    const result = await promise(healthService.check())
    expect(result.status).toEqual('ok')
  })

  it('should return degraded when Redis is unavailable', async () => {
    const redisClient = {
      ping: async (): Promise<string> => {
        throw new Error('Connection refused')
      },
    }
    const healthService = createHealthService(db, storage, redisClient)

    const result = await promise(healthService.check())
    expect(result.status).toEqual('degraded')
  })

  it('should return ok with no Redis client provided (Redis omitted)', async () => {
    const healthService = createHealthService(db, storage)

    const result = await promise(healthService.check())
    expect(result.status).toEqual('ok')
  })

  it('should handle Redis connection error gracefully without rejecting', async () => {
    const redisClient = {
      ping: async (): Promise<string> => {
        throw new Error('ECONNREFUSED')
      },
    }
    const healthService = createHealthService(db, storage, redisClient)

    // Must resolve (not reject) — Redis failure is a soft degraded state
    let result: { status: 'ok' | 'degraded' } | undefined
    let threw = false
    try {
      result = await promise(healthService.check())
    } catch {
      threw = true
    }

    expect(threw).toBe(false)
    expect(result?.status).toEqual('degraded')
  })

  it('should return a detailed response matching the expected health status schema', async () => {
    const healthService = createHealthService(db, storage)

    const result = await promise(healthService.checkDetailed())
    expect(result).toHaveProperty('status')
    expect(result).toHaveProperty('timestamp')
    expect(result).toHaveProperty('checks')
    expect(['ok', 'degraded', 'unhealthy']).toContain(result.status)
  })

  it('should sanitize storage errors in the detailed response', async () => {
    const healthService = createHealthService(db, {
      exists: () => resolve(true),
      write: () => resolve(void 0),
      read: () => reject(new Error('S3AccessDenied: leaked detail')),
      delete: () => resolve(void 0),
    })

    const result = await promise(healthService.checkDetailed())

    expect(result.status).toEqual('unhealthy')
    expect(result.checks.storage.status).toEqual('error')
    expect(result.checks.storage.error).toEqual('Health check failed')
  })

  it('should close the storage read stream during the health check', async () => {
    const healthStream = Readable.from(['ok'])
    const healthService = createHealthService(db, {
      exists: () => resolve(true),
      write: () => resolve(void 0),
      read: () => resolve(healthStream),
      delete: () => resolve(void 0),
    })

    const result = await promise(healthService.checkDetailed())

    expect(result.status).toEqual('ok')
    expect(healthStream.destroyed).toEqual(true)
  })

  it('should wait for the storage read stream to settle before deleting the file', async () => {
    let settled = false
    const healthStream = new Readable({
      read(this: Readable) {
        setImmediate(() => {
          this.push('ok')
          this.push(null)
        })
      },
    })

    healthStream.once('end', () => {
      settled = true
    })

    const healthService = createHealthService(db, {
      exists: () => resolve(true),
      write: () => resolve(void 0),
      read: () => resolve(healthStream),
      delete: () =>
        settled
          ? resolve(void 0)
          : reject(new Error('storage deleted before the stream settled')),
    })

    const result = await promise(healthService.checkDetailed())

    expect(result.status).toEqual('ok')
    expect(settled).toEqual(true)
    expect(healthStream.destroyed).toEqual(true)
  })

  it('should mark degraded core checks as degraded and errors as unhealthy', () => {
    const healthService = createHealthService(db, storage)

    expect(
      healthService.computeOverallStatus({
        database: { status: 'degraded' },
        storage: { status: 'ok' },
      } as never)
    ).toEqual('degraded')

    expect(
      healthService.computeOverallStatus({
        database: { status: 'error' },
        storage: { status: 'ok' },
      } as never)
    ).toEqual('unhealthy')
  })
})
