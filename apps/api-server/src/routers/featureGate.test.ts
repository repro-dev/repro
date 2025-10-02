import expect from 'expect'
import { FastifyInstance } from 'fastify'
import { parallel, promise } from 'fluture'
import { after, before, beforeEach, describe, it } from 'node:test'
import { FeatureGateService } from '~/services/featureGate'
import { Harness, createTestHarness } from '~/testing'
import { createFeatureGateRouter } from './featureGate'

describe('Routers > FeatureGate', () => {
  let harness: Harness
  let featureGateService: FeatureGateService
  let app: FastifyInstance

  before(async () => {
    harness = await createTestHarness()
    featureGateService = harness.services.featureGateService
    app = harness.bootstrap(createFeatureGateRouter(featureGateService))

    // Placeholder to use the variables and avoid TypeScript errors
    void app
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
})
