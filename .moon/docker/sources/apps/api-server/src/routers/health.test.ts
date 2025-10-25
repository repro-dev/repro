import expect from 'expect'
import { reject } from 'fluture'
import { after, before, describe, it } from 'node:test'
import { Database } from '~/modules/database'
import { Storage } from '~/modules/storage'
import { createHealthService } from '~/services/health'
import { setUpTestDatabase } from '~/testing/database'
import { setUpTestFileSystemStorage } from '~/testing/storage'
import { fromRouter } from '~/testing/utils'
import { serviceUnavailable } from '~/utils/errors'
import { createHealthRouter } from './health'

describe('Routers > Health', () => {
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

  it('should return 503 on an invalid health check', async () => {
    const healthRouter = createHealthRouter({
      check() {
        return reject(serviceUnavailable('Health check failed'))
      },
    })

    const app = fromRouter(healthRouter)
    const res = await app.inject({
      method: 'GET',
      url: '/',
    })

    expect(res.statusCode).toEqual(503)
  })
})
