import { Project, RecordingInfo, RecordingMode, Session } from '@repro/domain'
import expect from 'expect'
import { FastifyInstance } from 'fastify'
import { promise } from 'fluture'
import { after, before, beforeEach, describe, it } from 'node:test'
import { encodeId } from '~/modules/database'
import { RecordingService } from '~/services/recording'
import { Harness, createTestHarness, fixtures } from '~/testing'
import { createStaffRouter } from './staff'

describe('Routers > Staff', () => {
  let harness: Harness
  let recordingService: RecordingService
  let app: FastifyInstance

  before(async () => {
    harness = await createTestHarness()
    recordingService = harness.services.recordingService
    app = harness.bootstrap(
      createStaffRouter(
        harness.services.accountService,
        harness.services.projectService,
        recordingService
      )
    )
  })

  beforeEach(async () => {
    await harness.reset()
  })

  after(async () => {
    await harness.close()
  })

  describe('GET /recordings', () => {
    it('should return a list of recordings for staff user', async () => {
      const [staffSession, recordingA, recordingB] = await harness.loadFixtures(
        [
          fixtures.account.StaffUserA_Session,
          fixtures.recording.RecordingA,
          fixtures.recording.RecordingB,
        ]
      )

      const res = await app.inject({
        method: 'GET',
        url: '/recordings',
        headers: {
          authorization: `Bearer ${(staffSession as Session).sessionToken}`,
        },
      })

      expect(res.statusCode).toEqual(200)
      const body = res.json()
      expect(body).toHaveProperty('items')
      expect(Array.isArray(body.items)).toBe(true)
      expect(body.items.length).toBeGreaterThanOrEqual(2)
      expect(body.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: (recordingA as RecordingInfo).id,
          }),
          expect.objectContaining({
            id: (recordingB as RecordingInfo).id,
          }),
        ])
      )
    })

    it('should return empty items list when no recordings exist', async () => {
      const [staffSession] = await harness.loadFixtures([
        fixtures.account.StaffUserA_Session,
      ])

      const res = await app.inject({
        method: 'GET',
        url: '/recordings',
        headers: {
          authorization: `Bearer ${(staffSession as Session).sessionToken}`,
        },
      })

      expect(res.statusCode).toEqual(200)
      expect(res.json()).toEqual({ items: [] })
    })

    it('should return 401 when not authenticated', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/recordings',
      })

      expect(res.statusCode).toEqual(401)
    })

    it('should return 403 when authenticated as non-staff', async () => {
      const [userSession] = await harness.loadFixtures([
        fixtures.account.UserA_Session,
      ])

      const res = await app.inject({
        method: 'GET',
        url: '/recordings',
        headers: {
          authorization: `Bearer ${(userSession as Session).sessionToken}`,
        },
      })

      expect(res.statusCode).toEqual(403)
    })

    it('should respect offset/limit pagination', async () => {
      const [staffSession] = await harness.loadFixtures([
        fixtures.account.StaffUserA_Session,
      ])

      const rec1 = await promise(
        recordingService.writeInfo(
          'Recording 1',
          'https://example.com/1',
          'First recording',
          RecordingMode.Replay,
          1000,
          null,
          null,
          null
        )
      )

      const rec2 = await promise(
        recordingService.writeInfo(
          'Recording 2',
          'https://example.com/2',
          'Second recording',
          RecordingMode.Replay,
          2000,
          null,
          null,
          null
        )
      )

      // Offset=0, limit=1 should return only the first recording
      const res1 = await app.inject({
        method: 'GET',
        url: '/recordings?offset=0&limit=1',
        headers: {
          authorization: `Bearer ${(staffSession as Session).sessionToken}`,
        },
      })

      expect(res1.statusCode).toEqual(200)
      const body1 = res1.json()
      expect(body1.items).toHaveLength(1)
      expect(body1.items[0].id).toEqual(rec1.id)

      // Offset=1, limit=1 should return only the second recording
      const res2 = await app.inject({
        method: 'GET',
        url: '/recordings?offset=1&limit=1',
        headers: {
          authorization: `Bearer ${(staffSession as Session).sessionToken}`,
        },
      })

      expect(res2.statusCode).toEqual(200)
      const body2 = res2.json()
      expect(body2.items).toHaveLength(1)
      expect(body2.items[0].id).toEqual(rec2.id)
    })
  })

  describe('GET /recordings/:recordingId/project', () => {
    it('should return the project id for a recording that belongs to a project', async () => {
      const [staffSession, recordingA, projectA] = await harness.loadFixtures([
        fixtures.account.StaffUserA_Session,
        fixtures.recording.RecordingA,
        fixtures.project.ProjectA_Multiple_Recordings,
      ])

      const res = await app.inject({
        method: 'GET',
        url: `/recordings/${(recordingA as RecordingInfo).id}/project`,
        headers: {
          authorization: `Bearer ${(staffSession as Session).sessionToken}`,
        },
      })

      expect(res.statusCode).toEqual(200)
      expect(res.json()).toEqual({ projectId: (projectA as Project).id })
    })

    it('should return a null projectId for an unknown recording id', async () => {
      const [staffSession] = await harness.loadFixtures([
        fixtures.account.StaffUserA_Session,
      ])

      const res = await app.inject({
        method: 'GET',
        url: `/recordings/${encodeId(999999)}/project`,
        headers: {
          authorization: `Bearer ${(staffSession as Session).sessionToken}`,
        },
      })

      expect(res.statusCode).toEqual(200)
      expect(res.json()).toEqual({ projectId: null })
    })

    it('should return 401 when not authenticated', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/recordings/${encodeId(1)}/project`,
      })

      expect(res.statusCode).toEqual(401)
    })

    it('should return 403 when authenticated as non-staff', async () => {
      const [userSession] = await harness.loadFixtures([
        fixtures.account.UserA_Session,
      ])

      const res = await app.inject({
        method: 'GET',
        url: `/recordings/${encodeId(1)}/project`,
        headers: {
          authorization: `Bearer ${(userSession as Session).sessionToken}`,
        },
      })

      expect(res.statusCode).toEqual(403)
    })

    it('should return 400 for a malformed recording id', async () => {
      const [staffSession] = await harness.loadFixtures([
        fixtures.account.StaffUserA_Session,
      ])

      const res = await app.inject({
        method: 'GET',
        url: '/recordings/not-a-sqid/project',
        headers: {
          authorization: `Bearer ${(staffSession as Session).sessionToken}`,
        },
      })

      expect(res.statusCode).toEqual(400)
    })
  })
})
