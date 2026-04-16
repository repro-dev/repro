import expect from 'expect'
import { resolve } from 'fluture'
import { after, before, describe, it } from 'node:test'
import { Database } from '~/modules/database'
import { Storage } from '~/modules/storage'
import { createHealthService } from '~/services/health'
import { setUpTestDatabase } from '~/testing/database'
import { setUpTestFileSystemStorage } from '~/testing/storage'
import { fromRouter } from '~/testing/utils'
import { createHealthRouter } from './health'

describe('Routers > Health', () => {
  let reset = async () => {}
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

  it('should return 200 on a valid health check', async () => {
    const healthService = createHealthService(db, storage)
    const healthRouter = createHealthRouter(healthService)
    const app = fromRouter(healthRouter)

    const res = await app.inject({
      method: 'GET',
      url: '/',
    })

    expect(res.headers['content-type']).toMatch(/json/)
    expect(res.statusCode).toEqual(200)
  })

  it('should return 503 with unhealthy status in body when a core subsystem is down', async () => {
    const healthRouter = createHealthRouter({
      checkDetailed() {
        return resolve({
          status: 'unhealthy' as const,
          timestamp: new Date().toISOString(),
          checks: {
            database: { status: 'error', error: 'connection refused' },
            storage: { status: 'ok' },
          },
        })
      },
      check() {
        return resolve({ status: 'ok' as const })
      },
    })

    const app = fromRouter(healthRouter)
    const res = await app.inject({
      method: 'GET',
      url: '/',
    })

    const body = JSON.parse(res.body)
    expect(res.statusCode).toEqual(503)
    expect(body.status).toEqual('unhealthy')
    expect(body.checks.database.status).toEqual('error')
    expect(body.checks.database.error).toEqual('connection refused')
  })

  it('should return 200 with degraded status when Redis is down', async () => {
    const redisClient = {
      ping: async () => {
        throw new Error('Connection refused')
      },
    }
    const healthService = createHealthService(db, storage, redisClient)
    const healthRouter = createHealthRouter(healthService)
    const app = fromRouter(healthRouter)

    const res = await app.inject({
      method: 'GET',
      url: '/',
    })

    expect(res.statusCode).toEqual(200)
    expect(res.headers['content-type']).toMatch(/json/)
    expect(JSON.parse(res.body).status).toEqual('degraded')
  })

  it('should return 200 with ok status when all services are healthy', async () => {
    const redisClient = { ping: async () => 'PONG' }
    const healthService = createHealthService(db, storage, redisClient)
    const healthRouter = createHealthRouter(healthService)
    const app = fromRouter(healthRouter)

    const res = await app.inject({
      method: 'GET',
      url: '/',
    })

    expect(res.statusCode).toEqual(200)
    expect(JSON.parse(res.body).status).toEqual('ok')
  })
})
