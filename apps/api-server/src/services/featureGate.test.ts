import expect from 'expect'
import { parallel, promise } from 'fluture'
import { after, before, beforeEach, describe, it } from 'node:test'
import { Harness, createTestHarness } from '~/testing'
import { errorType, notFound, resourceConflict } from '~/utils/errors'
import { FeatureGateService } from './featureGate'

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
      active: 1,
      createdAt: expect.any(String),
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

  it('should create a feature gate with empty description and default active to 1', async () => {
    const featureGate = await promise(
      featureGateService.createFeatureGate('Empty Desc Feature', '')
    )

    expect(featureGate).toMatchObject({
      id: expect.any(String),
      name: 'Empty Desc Feature',
      description: '',
      active: 1,
      createdAt: expect.any(String),
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
      active: 1,
      createdAt: created.createdAt,
    })
  })

  it('should throw not-found when getting a feature gate by an invalid ID', async () => {
    await expect(
      promise(featureGateService.getFeatureGateById('invalid-id'))
    ).rejects.toThrow(notFound())
  })
})
