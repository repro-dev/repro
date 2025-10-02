import { FastifyInstance } from 'fastify'
import { before, beforeEach, after, describe } from 'node:test'
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

  // TODO: Add tests for feature gate router endpoints
  // e.g., GET /feature-gates, POST /feature-gates, etc.
})