import expect from 'expect'
import { promise } from 'fluture'
import { after, before, describe, it } from 'node:test'
import { Database } from '~/modules/database'
import { Storage } from '~/modules/storage'
import { setUpTestDatabase } from '~/testing/database'
import { setUpTestFileSystemStorage } from '~/testing/storage'
import { HealthStatus, createHealthService } from './health'

describe('Services > Health', () => {
  let reset: () => Promise<void>
  let db: Database
  let storage: Storage

  before(async () => {
    const { db: dbInstance, close: closeDb } = await setUpTestDatabase()
    const { storage: storageInstance, close: closeStorage } =
      await setUpTestFileSystemStorage()

    db = dbInstance
    storage = storageInstance

    reset = async () => {
      await closeDb()
      await closeStorage()
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
    let result: HealthStatus | undefined
    let threw = false
    try {
      result = await promise(healthService.check())
    } catch {
      threw = true
    }

    expect(threw).toBe(false)
    expect(result?.status).toEqual('degraded')
  })

  it('should return a response matching the expected health status schema', async () => {
    const healthService = createHealthService(db, storage)

    const result = await promise(healthService.check())
    expect(result).toHaveProperty('status')
    expect(['ok', 'degraded']).toContain(result.status)
  })
})
