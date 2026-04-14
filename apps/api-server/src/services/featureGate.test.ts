import expect from 'expect'
import { parallel, promise } from 'fluture'
import { after, before, beforeEach, describe, it } from 'node:test'
import { Harness, createTestHarness, fixtures } from '~/testing'
import { errorType, notFound, resourceConflict } from '~/utils/errors'
import { FeatureGateService, createFeatureGateMiddleware } from './featureGate'

describe('Services > Feature Gate', () => {
  let harness: Harness
  let featureGateService: FeatureGateService

  before(async () => {
    harness = await createTestHarness()
    featureGateService = harness.services.featureGateService
  })

  beforeEach(async () => {
    await harness.reset()
  })

  after(async () => {
    await harness.close()
  })

  it('should create a feature gate', async () => {
    const featureGate = await promise(
      featureGateService.createFeatureGate('Test Feature', 'A test feature')
    )

    expect(featureGate).toMatchObject({
      id: expect.any(String),
      name: 'Test Feature',
      description: 'A test feature',
      enabled: false,
      createdAt: expect.any(Date),
    })
  })

  it('should fail to create a feature gate with a duplicate name', async () => {
    await promise(
      featureGateService.createFeatureGate('Test Feature', 'A test feature')
    )

    await expect(
      promise(
        featureGateService.createFeatureGate(
          'Test Feature',
          'Another description'
        )
      )
    ).rejects.toThrow(errorType(resourceConflict()))
  })

  it('should support concurrent feature gate creation', async () => {
    await expect(
      promise(
        parallel(Infinity)(
          ['Feature 1', 'Feature 2', 'Feature 3'].map(name =>
            featureGateService.createFeatureGate(
              name,
              `Description for ${name}`
            )
          )
        )
      )
    ).resolves.toBeDefined()
  })

  it('should create a feature gate with empty description and default active to 0', async () => {
    const featureGate = await promise(
      featureGateService.createFeatureGate('Empty Desc Feature', '')
    )

    expect(featureGate).toMatchObject({
      id: expect.any(String),
      name: 'Empty Desc Feature',
      description: '',
      enabled: false,
      createdAt: expect.any(Date),
    })
  })

  it('should get a feature gate by ID', async () => {
    const created = await promise(
      featureGateService.createFeatureGate('Test Feature', 'A test feature')
    )

    const retrieved = await promise(
      featureGateService.getFeatureGateById(created.id)
    )

    expect(retrieved).toMatchObject({
      id: created.id,
      name: 'Test Feature',
      description: 'A test feature',
      enabled: false,
      createdAt: expect.any(Date),
    })
  })

  it('should throw not-found when getting a feature gate by an invalid ID', async () => {
    await expect(
      promise(featureGateService.getFeatureGateById('invalid-id'))
    ).rejects.toThrow(notFound())
  })

  it('should list feature gates in ascending order by name', async () => {
    await promise(
      featureGateService.createFeatureGate('Z Feature', 'Last feature')
    )
    await promise(
      featureGateService.createFeatureGate('A Feature', 'First feature')
    )

    const list = await promise(featureGateService.listFeatureGates('asc'))

    expect(list).toHaveLength(2)
    expect(list[0]?.name).toBe('A Feature')
    expect(list[1]?.name).toBe('Z Feature')
  })

  it('should list feature gates in descending order by name', async () => {
    await promise(
      featureGateService.createFeatureGate('A Feature', 'First feature')
    )
    await promise(
      featureGateService.createFeatureGate('Z Feature', 'Last feature')
    )

    const list = await promise(featureGateService.listFeatureGates('desc'))

    expect(list).toHaveLength(2)
    expect(list[0]?.name).toBe('Z Feature')
    expect(list[1]?.name).toBe('A Feature')
  })

  it('should return an empty list when no feature gates exist', async () => {
    const list = await promise(featureGateService.listFeatureGates())

    expect(list).toEqual([])
  })

  it('should update a feature gate', async () => {
    const created = await promise(
      featureGateService.createFeatureGate('Test Feature', 'A test feature')
    )

    const updated = await promise(
      featureGateService.updateFeatureGate(created.id, {
        name: 'Updated Feature',
        description: 'Updated description',
        enabled: false,
      })
    )

    expect(updated).toMatchObject({
      id: created.id,
      name: 'Updated Feature',
      description: 'Updated description',
      enabled: false,
      createdAt: expect.any(Date),
    })
  })

  it('should update only provided fields', async () => {
    const created = await promise(
      featureGateService.createFeatureGate('Test Feature', 'A test feature')
    )

    const updated = await promise(
      featureGateService.updateFeatureGate(created.id, {
        description: 'New description',
      })
    )

    expect(updated).toMatchObject({
      id: created.id,
      name: 'Test Feature',
      description: 'New description',
      enabled: false,
      createdAt: created.createdAt,
    })
  })

  it('should fail to update a feature gate with a duplicate name', async () => {
    await promise(
      featureGateService.createFeatureGate('Feature One', 'First feature')
    )
    const second = await promise(
      featureGateService.createFeatureGate('Feature Two', 'Second feature')
    )

    await expect(
      promise(
        featureGateService.updateFeatureGate(second.id, {
          name: 'Feature One',
        })
      )
    ).rejects.toThrow(errorType(resourceConflict()))
  })

  it('should throw not-found when updating a feature gate with invalid ID', async () => {
    await expect(
      promise(
        featureGateService.updateFeatureGate('invalid-id', {
          name: 'Updated Name',
        })
      )
    ).rejects.toThrow(notFound())
  })

  it('should remove a feature gate', async () => {
    const created = await promise(
      featureGateService.createFeatureGate('Test Feature', 'A test feature')
    )

    await promise(featureGateService.removeFeatureGate(created.id))

    await expect(
      promise(featureGateService.getFeatureGateById(created.id))
    ).rejects.toThrow(notFound())
  })

  it('should throw not-found when removing a feature gate with invalid ID', async () => {
    await expect(
      promise(featureGateService.removeFeatureGate('invalid-id'))
    ).rejects.toThrow(notFound())
  })

  it('should allow removing multiple feature gates', async () => {
    const gate1 = await promise(
      featureGateService.createFeatureGate('Feature 1', 'First feature')
    )
    const gate2 = await promise(
      featureGateService.createFeatureGate('Feature 2', 'Second feature')
    )

    await promise(featureGateService.removeFeatureGate(gate1.id))
    await promise(featureGateService.removeFeatureGate(gate2.id))

    const list = await promise(featureGateService.listFeatureGates())
    expect(list).toEqual([])
  })

  it('should list only enabled feature gates in ascending order', async () => {
    const enabledGate = await promise(
      featureGateService.createFeatureGate('Enabled Feature', 'Enabled')
    )

    await promise(
      featureGateService.updateFeatureGate(enabledGate.id, { enabled: true })
    )

    const list = await promise(
      featureGateService.listEnabledFeatureGates('asc')
    )

    expect(list).toHaveLength(1)
    expect(list[0]?.name).toBe('Enabled Feature')
    expect(list[0]?.enabled).toBe(true)
  })

  it('should list only enabled feature gates in descending order', async () => {
    const enabledGate1 = await promise(
      featureGateService.createFeatureGate('A Enabled', 'First enabled')
    )
    const enabledGate2 = await promise(
      featureGateService.createFeatureGate('Z Enabled', 'Last enabled')
    )

    await promise(
      featureGateService.updateFeatureGate(enabledGate1.id, { enabled: true })
    )
    await promise(
      featureGateService.updateFeatureGate(enabledGate2.id, { enabled: true })
    )

    const list = await promise(
      featureGateService.listEnabledFeatureGates('desc')
    )

    expect(list).toHaveLength(2)
    expect(list[0]?.name).toBe('Z Enabled')
    expect(list[1]?.name).toBe('A Enabled')
  })

  it('should return empty list when no enabled feature gates exist', async () => {
    await promise(
      featureGateService.createFeatureGate('Disabled Feature', 'Disabled')
    )

    const list = await promise(featureGateService.listEnabledFeatureGates())

    expect(list).toEqual([])
  })
})

describe('Middleware > createFeatureGateMiddleware', () => {
  let harness: Harness
  let stubbedApp: import('fastify').FastifyInstance
  let enforcedApp: import('fastify').FastifyInstance

  before(async () => {
    harness = await createTestHarness()

    const { billingService, accountService } = harness.services

    // Default harness env has BILLING_STUBBED=true — gate is bypassed
    const stubbedRequireFeature = createFeatureGateMiddleware(
      billingService,
      accountService,
      harness.env
    )

    // Override to enforce entitlement checks
    const enforcedRequireFeature = createFeatureGateMiddleware(
      billingService,
      accountService,
      { ...harness.env, BILLING_STUBBED: false }
    )

    stubbedApp = harness.bootstrap(async app => {
      app.get(
        '/gated',
        { preHandler: stubbedRequireFeature('ai_credits') },
        (_req, res) => {
          res.status(200).send({ ok: true })
        }
      )
    })
    await stubbedApp.ready()

    enforcedApp = harness.bootstrap(async app => {
      app.get(
        '/gated',
        { preHandler: enforcedRequireFeature('ai_credits') },
        (_req, res) => {
          res.status(200).send({ ok: true })
        }
      )
    })
    await enforcedApp.ready()
  })

  beforeEach(async () => {
    await harness.reset()
  })

  after(async () => {
    await harness.close()
  })

  it('should bypass gate when BILLING_STUBBED=true', async () => {
    // No subscription needed — gate is a no-op when stubbed
    const [session] = await harness.loadFixtures([
      fixtures.account.UserA_Session,
    ])

    const res = await stubbedApp.inject({
      method: 'GET',
      url: '/gated',
      cookies: {
        [harness.env.SESSION_COOKIE]: stubbedApp.signCookie(
          session.sessionToken
        ),
      },
    })

    expect(res.statusCode).toEqual(200)
  })

  it('should allow request when account is entitled (ProPlan, ai_credits enabled)', async () => {
    const [, session] = await harness.loadFixtures([
      fixtures.billing.AccountA_ProPlan_Subscription,
      fixtures.account.UserA_Session,
    ])

    const res = await enforcedApp.inject({
      method: 'GET',
      url: '/gated',
      cookies: {
        [harness.env.SESSION_COOKIE]: enforcedApp.signCookie(
          session.sessionToken
        ),
      },
    })

    expect(res.statusCode).toEqual(200)
  })

  it('should return 403 when account is not entitled (FreePlan, ai_credits disabled)', async () => {
    const [, session] = await harness.loadFixtures([
      fixtures.billing.AccountA_FreePlan_Subscription,
      fixtures.account.UserA_Session,
    ])

    const res = await enforcedApp.inject({
      method: 'GET',
      url: '/gated',
      cookies: {
        [harness.env.SESSION_COOKIE]: enforcedApp.signCookie(
          session.sessionToken
        ),
      },
    })

    expect(res.statusCode).toEqual(403)
  })

  it('should return 401 when not authenticated', async () => {
    const res = await enforcedApp.inject({
      method: 'GET',
      url: '/gated',
    })

    expect(res.statusCode).toEqual(401)
  })
})
