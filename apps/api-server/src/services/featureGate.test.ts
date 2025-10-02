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
       enabled: 1,
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
       enabled: 1,
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
       enabled: 1,
       createdAt: created.createdAt,
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
         enabled: 0,
       })
     )

      expect(updated).toMatchObject({
        id: created.id,
        name: 'Updated Feature',
        description: 'Updated description',
        enabled: 0,
        createdAt: created.createdAt,
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
        enabled: 1,
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
 })
