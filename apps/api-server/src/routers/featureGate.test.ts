import expect from 'expect'
import { FastifyInstance } from 'fastify'
import { parallel, promise } from 'fluture'
import { after, before, beforeEach, describe, it } from 'node:test'
import { FeatureGateService } from '~/services/featureGate'
import { Harness, createTestHarness, fixtures } from '~/testing'
import { FeatureGate } from '~/types/featureGate'
import { createFeatureGateRouter } from './featureGate'

describe('Routers > FeatureGate', () => {
  let harness: Harness
  let featureGateService: FeatureGateService
  let app: FastifyInstance

  before(async () => {
    harness = await createTestHarness()
    featureGateService = harness.services.featureGateService
    app = harness.bootstrap(
      createFeatureGateRouter(
        featureGateService,
        harness.services.accountService
      )
    )
  })

  beforeEach(async () => {
    await harness.reset()
  })

  after(async () => {
    await harness.close()
  })

  it('should return a list of enabled feature gate names', async () => {
    // Create some feature gates, some enabled, some not
    await promise(
      parallel(Infinity)([
        featureGateService.createFeatureGate('feature1', 'First feature'),
        featureGateService.createFeatureGate('feature2', 'Second feature'),
        featureGateService.createFeatureGate('feature3', 'Third feature'),
      ])
    )

    // Enable the first two
    const gates = await promise(featureGateService.listFeatureGates())
    await promise(
      parallel(Infinity)([
        featureGateService.updateFeatureGate(gates[0]!.id, { enabled: 1 }),
        featureGateService.updateFeatureGate(gates[1]!.id, { enabled: 1 }),
      ])
    )

    const response = await app.inject({
      method: 'GET',
      url: '/enabled',
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(Array.isArray(body)).toBe(true)
    expect(body).toEqual(['feature1', 'feature2'])
  })

  it('should return a list of all feature gates', async () => {
    // Create some feature gates
    await promise(
      parallel(Infinity)([
        featureGateService.createFeatureGate('feature1', 'First feature'),
        featureGateService.createFeatureGate('feature2', 'Second feature'),
        featureGateService.createFeatureGate('feature3', 'Third feature'),
      ])
    )

    const response = await app.inject({
      method: 'GET',
      url: '/',
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(Array.isArray(body)).toBe(true)
    expect(body).toHaveLength(3)
    expect(body.map((g: FeatureGate) => g.name)).toEqual([
      'feature1',
      'feature2',
      'feature3',
    ])
  })

  it('should create a new feature gate as a staff user', async () => {
    const [session] = await harness.loadFixtures([
      fixtures.account.StaffUserA_Session,
    ])

    const response = await app.inject({
      method: 'POST',
      url: '/',
      payload: {
        name: 'test-feature',
        description: 'A test feature gate',
      },
      headers: {
        authorization: `Bearer ${session.sessionToken}`,
      },
    })

    expect(response.statusCode).toBe(201)
    const body = response.json()
    expect(body).toMatchObject({
      name: 'test-feature',
      description: 'A test feature gate',
      enabled: 0,
    })
    expect(typeof body.id).toBe('string')
    expect(typeof body.createdAt).toBe('string')
  })

  it('should return permission denied when creating a feature gate as a non-staff user', async () => {
    const [session] = await harness.loadFixtures([
      fixtures.account.UserA_Session,
    ])

    const response = await app.inject({
      method: 'POST',
      url: '/',
      payload: {
        name: 'test-feature',
        description: 'A test feature gate',
      },
      headers: {
        authorization: `Bearer ${session.sessionToken}`,
      },
    })

    expect(response.statusCode).toBe(403)
  })

  it('should return conflict error when creating a duplicate feature gate', async () => {
    const [session] = await harness.loadFixtures([
      fixtures.account.StaffUserA_Session,
    ])

    // Create the first feature gate
    await app.inject({
      method: 'POST',
      url: '/',
      payload: {
        name: 'duplicate-feature',
        description: 'A duplicate feature gate',
      },
      headers: {
        authorization: `Bearer ${session.sessionToken}`,
      },
    })

    // Try to create the same feature gate again
    const response = await app.inject({
      method: 'POST',
      url: '/',
      payload: {
        name: 'duplicate-feature',
        description: 'A duplicate feature gate',
      },
      headers: {
        authorization: `Bearer ${session.sessionToken}`,
      },
    })

    expect(response.statusCode).toBe(409)
  })

  it('should update a feature gate as a staff user', async () => {
    const [session] = await harness.loadFixtures([
      fixtures.account.StaffUserA_Session,
    ])

    // Create a feature gate first
    const createResponse = await app.inject({
      method: 'POST',
      url: '/',
      payload: {
        name: 'update-feature',
        description: 'A feature to update',
      },
      headers: {
        authorization: `Bearer ${session.sessionToken}`,
      },
    })

    expect(createResponse.statusCode).toBe(201)
    const createdGate = createResponse.json()

    // Update the feature gate
    const updateResponse = await app.inject({
      method: 'PATCH',
      url: `/${createdGate.id}`,
      payload: {
        description: 'Updated description',
        enabled: 1,
      },
      headers: {
        authorization: `Bearer ${session.sessionToken}`,
      },
    })

    expect(updateResponse.statusCode).toBe(200)
    const updatedGate = updateResponse.json()
    expect(updatedGate).toMatchObject({
      id: createdGate.id,
      name: 'update-feature',
      description: 'Updated description',
      enabled: 1,
    })
  })

  it('should return permission denied when updating a feature gate as a non-staff user', async () => {
    const [session] = await harness.loadFixtures([
      fixtures.account.UserA_Session,
    ])

    // Create a feature gate first as staff
    const [staffSession] = await harness.loadFixtures([
      fixtures.account.StaffUserA_Session,
    ])

    const createResponse = await app.inject({
      method: 'POST',
      url: '/',
      payload: {
        name: 'update-feature-non-staff',
        description: 'A feature to update as non-staff',
      },
      headers: {
        authorization: `Bearer ${staffSession.sessionToken}`,
      },
    })

    expect(createResponse.statusCode).toBe(201)
    const createdGate = createResponse.json()

    // Try to update as non-staff user
    const updateResponse = await app.inject({
      method: 'PATCH',
      url: `/${createdGate.id}`,
      payload: {
        description: 'Updated by non-staff',
      },
      headers: {
        authorization: `Bearer ${session.sessionToken}`,
      },
    })

    expect(updateResponse.statusCode).toBe(403)
  })

  it('should return not found when updating a non-existent feature gate', async () => {
    const [session] = await harness.loadFixtures([
      fixtures.account.StaffUserA_Session,
    ])

    const updateResponse = await app.inject({
      method: 'PATCH',
      url: '/non-existent-id',
      payload: {
        description: 'Updated description',
      },
      headers: {
        authorization: `Bearer ${session.sessionToken}`,
      },
    })

    expect(updateResponse.statusCode).toBe(404)
  })
})
