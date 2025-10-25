import {
  InteractionType,
  Project,
  ProjectRole,
  RecordingMode,
  SourceEvent,
  SourceEventType,
} from '@repro/domain'
import { Box } from '@repro/tdl'
import expect from 'expect'
import { FastifyInstance } from 'fastify'
import { chain, promise } from 'fluture'
import { after, before, beforeEach, describe, it } from 'node:test'
import { encodeId } from '~/modules/database'
import { Harness, createTestHarness, fixtures } from '~/testing'
import { createRecordingDataWireFormat } from '~/testing/recording'
import { readableToString } from '~/testing/utils'
import { errorType, notFound } from '~/utils/errors'
import { createProjectRouter } from './project'

describe('Routers > Project', () => {
  let harness: Harness
  let app: FastifyInstance

  before(async () => {
    harness = await createTestHarness()
    app = harness.bootstrap(
      createProjectRouter(
        harness.services.projectService,
        harness.services.recordingService,
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

  describe('Projects', () => {
    it('should create a new project as an admin user', async () => {
      const [session] = await harness.loadFixtures([
        fixtures.account.AdminUserA_Session,
      ])

      const res = await app.inject({
        method: 'POST',
        url: '/',
        body: {
          name: 'Test Project',
        },
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(201)
      expect(res.json()).toMatchObject({
        id: expect.any(String),
        name: 'Test Project',
      })
    })

    it('should create a new project as a member user', async () => {
      const [session] = await harness.loadFixtures([
        fixtures.account.UserA_Session,
      ])

      const res = await app.inject({
        method: 'POST',
        url: '/',
        body: {
          name: 'Test Project',
        },
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(201)
      expect(res.json()).toMatchObject({
        id: expect.any(String),
        name: 'Test Project',
      })
    })

    it('should give the creating user the project role "admin"', async () => {
      const [user, session] = await harness.loadFixtures([
        fixtures.account.UserA,
        fixtures.account.UserA_Session,
      ])

      const res = await app.inject({
        method: 'POST',
        url: '/',
        body: {
          name: 'Test Project',
        },
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      const project = res.json<Project>()

      await expect(
        promise(
          harness.services.projectService.getUserProjectRole(
            user.id,
            project.id
          )
        )
      ).resolves.toEqual(ProjectRole.Admin)
    })

    it('should get all projects for a user', async () => {
      const [projectA, projectB, _, session] = await harness.loadFixtures([
        fixtures.project.ProjectA,
        fixtures.project.ProjectB,
        fixtures.project.UserA_Multiple_Projects,
        fixtures.account.UserA_Session,
      ])

      const res = await app.inject({
        method: 'GET',
        url: '/',
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(200)
      expect(res.json()).toEqual([projectB, projectA])
    })
  })

  describe('Project deactivation', () => {
    it('should deactivate a project as a user with admin project role', async () => {
      const [project, _, session] = await harness.loadFixtures([
        fixtures.project.ProjectA,
        fixtures.project.UserC_ProjectA_Admin,
        fixtures.account.UserC_Session,
      ])

      const res = await app.inject({
        method: 'PUT',
        url: `/${project.id}/active`,
        body: { active: false },
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(204)

      await expect(
        promise(harness.services.projectService.getProjectById(project.id))
      ).rejects.toThrow(notFound())
    })

    it('should deactivate a project as an admin user', async () => {
      const [project, session] = await harness.loadFixtures([
        fixtures.project.ProjectA,
        fixtures.account.AdminUserA_Session,
      ])

      const res = await app.inject({
        method: 'PUT',
        url: `/${project.id}/active`,
        body: { active: false },
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(204)

      await expect(
        promise(harness.services.projectService.getProjectById(project.id))
      ).rejects.toThrow(notFound())
    })

    it('should return not-found when deactivating a project that does not exist', async () => {
      const [session] = await harness.loadFixtures([
        fixtures.account.AdminUserA_Session,
      ])

      const res = await app.inject({
        method: 'PUT',
        url: `/${encodeId(999)}/active`,
        body: { active: false },
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(404)
    })

    it('should return not-found when deactivating a project for another account', async () => {
      const [project, session] = await harness.loadFixtures([
        fixtures.project.ProjectC_AccountB,
        fixtures.account.AdminUserA_Session,
      ])

      const res = await app.inject({
        method: 'PUT',
        url: `/${project.id}/active`,
        body: { active: false },
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(404)
    })

    it('should return permission-denied when deactivating a project without admin role', async () => {
      const [project, _, session] = await harness.loadFixtures([
        fixtures.project.ProjectA,
        fixtures.project.UserA_ProjectA_Contributor,
        fixtures.account.UserA_Session,
      ])

      const res = await app.inject({
        method: 'PUT',
        url: `/${project.id}/active`,
        body: { active: false },
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(403)

      await expect(
        promise(harness.services.projectService.getProjectById(project.id))
      ).resolves.toEqual(project)
    })
  })

  describe('Project name', () => {
    it('should update a project name as a user with admin project role', async () => {
      const [project, _, session] = await harness.loadFixtures([
        fixtures.project.ProjectA,
        fixtures.project.UserC_ProjectA_Admin,
        fixtures.account.UserC_Session,
      ])

      const res = await app.inject({
        method: 'PUT',
        url: `/${project.id}/name`,
        body: { name: 'Renamed Project' },
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(204)

      await expect(
        promise(harness.services.projectService.getProjectById(project.id))
      ).resolves.toMatchObject({
        id: project.id,
        name: 'Renamed Project',
      })
    })

    it('should update a project name as an admin user', async () => {
      const [project, session] = await harness.loadFixtures([
        fixtures.project.ProjectA,
        fixtures.account.AdminUserA_Session,
      ])

      const res = await app.inject({
        method: 'PUT',
        url: `/${project.id}/name`,
        body: { name: 'Renamed Project' },
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(204)

      await expect(
        promise(harness.services.projectService.getProjectById(project.id))
      ).resolves.toMatchObject({
        id: project.id,
        name: 'Renamed Project',
      })
    })

    it('should return not-found when updating the name of a project that does not exist', async () => {
      const [session] = await harness.loadFixtures([
        fixtures.account.AdminUserA_Session,
      ])

      const res = await app.inject({
        method: 'PUT',
        url: `/${encodeId(999)}/name`,
        body: { name: 'Renamed Project' },
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(404)
    })

    it('should return not-found when updating the name of a project for another account', async () => {
      const [project, session] = await harness.loadFixtures([
        fixtures.project.ProjectC_AccountB,
        fixtures.account.AdminUserA_Session,
      ])

      const res = await app.inject({
        method: 'PUT',
        url: `/${project.id}/name`,
        body: { name: 'Renamed Project' },
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(404)

      await expect(
        promise(harness.services.projectService.getProjectById(project.id))
      ).resolves.toEqual(project)
    })

    it('should return permission-denied when updating the name of a project without admin role', async () => {
      const [project, _, session] = await harness.loadFixtures([
        fixtures.project.ProjectA,
        fixtures.project.UserA_ProjectA_Contributor,
        fixtures.account.UserA_Session,
      ])

      const res = await app.inject({
        method: 'PUT',
        url: `/${project.id}/name`,
        body: { name: 'Renamed Project' },
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(403)

      await expect(
        promise(harness.services.projectService.getProjectById(project.id))
      ).resolves.toEqual(project)
    })
  })

  describe('Membership', () => {
    it('should get all members for a project', async () => {
      const [project, userA, userB, userC, session] =
        await harness.loadFixtures([
          fixtures.project.ProjectA,
          fixtures.project.UserA_ProjectA_Contributor,
          fixtures.project.UserB_ProjectA_Viewer,
          fixtures.project.UserC_ProjectA_Admin,
          fixtures.account.AdminUserA_Session,
        ])

      const res = await app.inject({
        method: 'GET',
        url: `/${project.id}/members`,
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.json()).toMatchObject([
        { user: userA, role: ProjectRole.Contributor },
        { user: userB, role: ProjectRole.Viewer },
        { user: userC, role: ProjectRole.Admin },
      ])
    })

    it('should return not-found when getting all members for a project in another account', async () => {
      const [project, session] = await harness.loadFixtures([
        fixtures.project.ProjectC_AccountB,
        fixtures.account.AdminUserA_Session,
      ])

      const res = await app.inject({
        method: 'GET',
        url: `/${project.id}/members`,
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(404)
    })

    it('should add a member to a project when user has project admin role', async () => {
      const [project, userA, _, session] = await harness.loadFixtures([
        fixtures.project.ProjectA,
        fixtures.account.UserA,
        fixtures.project.UserC_ProjectA_Admin,
        fixtures.account.UserC_Session,
      ])

      const res = await app.inject({
        method: 'POST',
        url: `/${project.id}/members`,
        body: { userId: userA.id, role: ProjectRole.Contributor },
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.json()).toMatchObject({
        role: ProjectRole.Contributor,
        user: userA,
      })
    })

    it('should add a member to a project when user is an account admin', async () => {
      const [project, user, session] = await harness.loadFixtures([
        fixtures.project.ProjectA,
        fixtures.account.UserA,
        fixtures.account.AdminUserA_Session,
      ])

      const res = await app.inject({
        method: 'POST',
        url: `/${project.id}/members`,
        body: { userId: user.id, role: ProjectRole.Contributor },
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.json()).toMatchObject({
        role: ProjectRole.Contributor,
        user,
      })
    })

    it('should return permission-denied when adding a member to a project when user does not have project admin role', async () => {
      const [project, userA, _, session] = await harness.loadFixtures([
        fixtures.project.ProjectA,
        fixtures.account.UserA,
        fixtures.project.UserB_ProjectA_Viewer,
        fixtures.account.UserB_Session,
      ])

      const res = await app.inject({
        method: 'POST',
        url: `/${project.id}/members`,
        body: { userId: userA.id, role: ProjectRole.Contributor },
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(403)
    })

    it('should return not-found when adding a member to a project in another account', async () => {
      const [project, user, session] = await harness.loadFixtures([
        fixtures.project.ProjectC_AccountB,
        fixtures.account.UserD_AccountB,
        fixtures.account.AdminUserA_Session,
      ])

      const res = await app.inject({
        method: 'POST',
        url: `/${project.id}/members`,
        body: { userId: user.id, role: ProjectRole.Contributor },
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(404)
    })

    it('should return bad-request when adding a member from another account to a project', async () => {
      const [project, user, session] = await harness.loadFixtures([
        fixtures.project.ProjectA,
        fixtures.account.UserD_AccountB,
        fixtures.account.AdminUserA_Session,
      ])

      const res = await app.inject({
        method: 'POST',
        url: `/${project.id}/members`,
        body: { userId: user.id, role: ProjectRole.Contributor },
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(400)

      await expect(
        promise(
          harness.services.projectService.getUserProjectRole(
            user.id,
            project.id
          )
        )
      ).rejects.toThrow(errorType(notFound()))
    })

    it('should remove a member from a project when user has project admin role', async () => {
      const [project, userA, _, session] = await harness.loadFixtures([
        fixtures.project.ProjectA,
        fixtures.project.UserA_ProjectA_Contributor,
        fixtures.project.UserC_ProjectA_Admin,
        fixtures.account.UserC_Session,
      ])

      const res = await app.inject({
        method: 'DELETE',
        url: `/${project.id}/members/${userA.id}`,
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(204)

      await expect(
        promise(
          harness.services.projectService.getUserProjectRole(
            userA.id,
            project.id
          )
        )
      ).rejects.toThrow(notFound())
    })

    it('should remove a member from a project when user is an account admin', async () => {
      const [project, user, session] = await harness.loadFixtures([
        fixtures.project.ProjectA,
        fixtures.project.UserA_ProjectA_Contributor,
        fixtures.account.AdminUserA_Session,
      ])

      const res = await app.inject({
        method: 'DELETE',
        url: `/${project.id}/members/${user.id}`,
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(204)

      await expect(
        promise(
          harness.services.projectService.getUserProjectRole(
            user.id,
            project.id
          )
        )
      ).rejects.toThrow(errorType(notFound()))
    })

    it('should return permission-denied when removing a member from a project when user does not have project admin role', async () => {
      const [project, userA, _, session] = await harness.loadFixtures([
        fixtures.project.ProjectA,
        fixtures.project.UserA_ProjectA_Contributor,
        fixtures.project.UserB_ProjectA_Viewer,
        fixtures.account.UserB_Session,
      ])

      const res = await app.inject({
        method: 'DELETE',
        url: `/${project.id}/members/${userA.id}`,
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(403)

      await expect(
        promise(
          harness.services.projectService.getUserProjectRole(
            userA.id,
            project.id
          )
        )
      ).resolves.toEqual(ProjectRole.Contributor)
    })

    it('should return not-found when removing a member from a project in another account', async () => {
      const [project, user, session] = await harness.loadFixtures([
        fixtures.project.ProjectC_AccountB,
        fixtures.project.UserD_ProjectC_Contributor,
        fixtures.account.AdminUserA_Session,
      ])

      const res = await app.inject({
        method: 'DELETE',
        url: `/${project.id}/members/${user.id}`,
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(404)

      await expect(
        promise(
          harness.services.projectService.getUserProjectRole(
            user.id,
            project.id
          )
        )
      ).resolves.toEqual(ProjectRole.Contributor)
    })

    it('should get the membership role for a user', async () => {
      const [project, user, _, session] = await harness.loadFixtures([
        fixtures.project.ProjectA,
        fixtures.project.UserA_ProjectA_Contributor,
        fixtures.project.UserB_ProjectA_Viewer,
        fixtures.account.UserB_Session,
      ])

      const res = await app.inject({
        method: 'GET',
        url: `/${project.id}/members/${user.id}`,
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.json()).toMatchObject({
        user,
        role: ProjectRole.Contributor,
      })
    })

    it('should return not-found for a user-role where the user does not have membership', async () => {
      const [project, user, session] = await harness.loadFixtures([
        fixtures.project.ProjectA,
        fixtures.account.UserA,
        fixtures.account.AdminUserA_Session,
      ])

      const res = await app.inject({
        method: 'GET',
        url: `/${project.id}/members/${user.id}`,
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(404)
    })

    it('should return not found for a user-role where the project does not exist', async () => {
      const [user, session] = await harness.loadFixtures([
        fixtures.account.UserA,
        fixtures.account.AdminUserA_Session,
      ])

      const res = await app.inject({
        method: 'GET',
        url: `/${encodeId(999)}/members/${user.id}`,
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(404)
    })

    it('should return not-found for a user-role where the user does not exist', async () => {
      const [project, session] = await harness.loadFixtures([
        fixtures.project.ProjectA,
        fixtures.account.AdminUserA_Session,
      ])

      const res = await app.inject({
        method: 'GET',
        url: `/${project.id}/members/${encodeId(999)}`,
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(404)
    })

    it('should return not-found when getting the user-role for a user & project in another account', async () => {
      const [project, user, session] = await harness.loadFixtures([
        fixtures.project.ProjectC_AccountB,
        fixtures.project.UserD_ProjectC_Contributor,
        fixtures.account.AdminUserA_Session,
      ])

      const res = await app.inject({
        method: 'GET',
        url: `/${project.id}/members/${user.id}`,
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(404)
    })

    it('should update the membership role of a user when the actor is a project admin', async () => {
      const [project, subject, _, session] = await harness.loadFixtures([
        fixtures.project.ProjectA,
        fixtures.project.UserA_ProjectA_Contributor,
        fixtures.project.UserC_ProjectA_Admin,
        fixtures.account.UserC_Session,
      ])

      const res = await app.inject({
        method: 'PUT',
        url: `/${project.id}/members/${subject.id}/role`,
        body: { role: ProjectRole.Viewer },
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(204)

      await expect(
        promise(
          harness.services.projectService.getUserProjectRole(
            subject.id,
            project.id
          )
        )
      ).resolves.toEqual(ProjectRole.Viewer)
    })

    it('should update the membership role of a user when the actor is an account admin', async () => {
      const [project, subject, session] = await harness.loadFixtures([
        fixtures.project.ProjectA,
        fixtures.project.UserA_ProjectA_Contributor,
        fixtures.account.AdminUserA_Session,
      ])

      const res = await app.inject({
        method: 'PUT',
        url: `/${project.id}/members/${subject.id}/role`,
        body: { role: ProjectRole.Viewer },
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(204)

      await expect(
        promise(
          harness.services.projectService.getUserProjectRole(
            subject.id,
            project.id
          )
        )
      ).resolves.toEqual(ProjectRole.Viewer)
    })

    it('should return permission-denied when updating the membership role when the actor is not a project admin', async () => {
      const [project, subject, _, session] = await harness.loadFixtures([
        fixtures.project.ProjectA,
        fixtures.project.UserA_ProjectA_Contributor,
        fixtures.project.UserB_ProjectA_Viewer,
        fixtures.account.UserB_Session,
      ])

      const res = await app.inject({
        method: 'PUT',
        url: `/${project.id}/members/${subject.id}/role`,
        body: { role: ProjectRole.Admin },
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(403)
    })

    it('should return not-found when updating the membership role of a user in another account', async () => {
      const [project, subject, session] = await harness.loadFixtures([
        fixtures.project.ProjectC_AccountB,
        fixtures.project.UserD_ProjectC_Contributor,
        fixtures.account.AdminUserA_Session,
      ])

      const res = await app.inject({
        method: 'PUT',
        url: `/${project.id}/members/${subject.id}/role`,
        body: { role: ProjectRole.Admin },
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(404)
    })
  })

  describe('Recording info', () => {
    it('should get all recordings for a project where a user has membership', async () => {
      const [project, _, session, recordingA, recordingB] =
        await harness.loadFixtures([
          fixtures.project.ProjectA_Multiple_Recordings,
          fixtures.project.UserA_ProjectA_Contributor,
          fixtures.account.UserA_Session,
          fixtures.recording.RecordingA,
          fixtures.recording.RecordingB,
        ])

      const res = await app.inject({
        method: 'GET',
        url: `/${project.id}/recordings`,
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.json()).toEqual([recordingB, recordingA])
    })

    it('should get all recordings for a project where user is an account admin', async () => {
      const [project, session, recordingA, recordingB] =
        await harness.loadFixtures([
          fixtures.project.ProjectA_Multiple_Recordings,
          fixtures.account.AdminUserA_Session,
          fixtures.recording.RecordingA,
          fixtures.recording.RecordingB,
        ])

      const res = await app.inject({
        method: 'GET',
        url: `/${project.id}/recordings`,
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.json()).toEqual([recordingB, recordingA])
    })

    it('should return permission-denied when getting recordings for a project without membership', async () => {
      const [project, session] = await harness.loadFixtures([
        fixtures.project.ProjectA_Multiple_Recordings,
        fixtures.account.UserA_Session,
      ])

      const res = await app.inject({
        method: 'GET',
        url: `/${project.id}/recordings`,
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(403)
    })

    it('should return not-found when getting recordings for a project in another account', async () => {
      const [project, session] = await harness.loadFixtures([
        fixtures.project.ProjectC_AccountB,
        fixtures.account.AdminUserA_Session,
      ])

      const res = await app.inject({
        method: 'GET',
        url: `/${project.id}/recordings`,
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(404)
    })

    it('should get a single recording', async () => {
      const [project, recording, _, session] = await harness.loadFixtures([
        fixtures.project.ProjectA_Multiple_Recordings,
        fixtures.recording.RecordingA,
        fixtures.project.UserA_ProjectA_Contributor,
        fixtures.account.UserA_Session,
      ])

      const res = await app.inject({
        method: 'GET',
        url: `/${project.id}/recordings/${recording.id}/info`,
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.json()).toEqual(recording)
    })

    it('should return not-found when getting a recording that does not exist', async () => {
      const [project, session] = await harness.loadFixtures([
        fixtures.project.ProjectA,
        fixtures.account.AdminUserA_Session,
      ])

      const res = await app.inject({
        method: 'GET',
        url: `/${project.id}/recordings/${encodeId(999)}`,
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(404)
    })

    it('should return not-found when getting a recording from a project that does not exist', async () => {
      const [recording, session] = await harness.loadFixtures([
        fixtures.recording.RecordingA,
        fixtures.account.AdminUserA_Session,
      ])

      const res = await app.inject({
        method: 'GET',
        url: `/${encodeId(999)}/recordings/${recording.id}`,
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(404)
      expect(res.json()).not.toMatchObject(recording)
    })

    it('should return permission-denied when getting a recording in a project without membership', async () => {
      const [project, recording, session] = await harness.loadFixtures([
        fixtures.project.ProjectA_Multiple_Recordings,
        fixtures.recording.RecordingA,
        fixtures.account.UserC_Session,
      ])

      const res = await app.inject({
        method: 'GET',
        url: `/${project.id}/recordings/${recording.id}/info`,
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(403)
      expect(res.json()).not.toMatchObject(recording)
    })

    it('should return not-found when getting a recording in another account', async () => {
      const [project, recording, session] = await harness.loadFixtures([
        fixtures.project.ProjectC_AccountB_Multiple_Recordings,
        fixtures.recording.RecordingA,
        fixtures.account.AdminUserA_Session,
      ])

      const res = await app.inject({
        method: 'GET',
        url: `/${project.id}/recordings/${recording.id}/info`,
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(404)
      expect(res.json()).not.toMatchObject(recording)
    })

    it('should add a recording to a project', async () => {
      const [project, _, session] = await harness.loadFixtures([
        fixtures.project.ProjectA,
        fixtures.project.UserA_ProjectA_Contributor,
        fixtures.account.UserA_Session,
      ])

      const res = await app.inject({
        method: 'POST',
        url: `/${project.id}/recordings`,
        body: {
          title: 'New Recording',
          url: 'https://example.com',
          description: 'This is a new recording',
          mode: RecordingMode.Replay,
          duration: 30_000,
          browserName: 'Chrome',
          browserVersion: '120.0.0',
          operatingSystem: 'Linux x86_64',
        },
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(201)
      expect(res.json()).toMatchObject({
        id: expect.any(String),
        title: 'New Recording',
        url: 'https://example.com',
        description: 'This is a new recording',
        mode: RecordingMode.Replay,
        duration: 30_000,
        browserName: 'Chrome',
        browserVersion: '120.0.0',
        operatingSystem: 'Linux x86_64',
      })
    })

    it('should return permission-denied when adding a recording to a project without membership', async () => {
      const [project, session] = await harness.loadFixtures([
        fixtures.project.ProjectA,
        fixtures.account.UserA_Session,
      ])

      const res = await app.inject({
        method: 'POST',
        url: `/${project.id}/recordings`,
        body: {
          title: 'New Recording',
          url: 'https://example.com',
          description: 'This is a new recording',
          mode: RecordingMode.Replay,
          duration: 30_000,
          browserName: 'Chrome',
          browserVersion: '120.0.0',
          operatingSystem: 'Linux x86_64',
        },
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(403)
      expect(res.json()).not.toMatchObject({
        id: expect.any(String),
        title: 'New Recording',
      })
    })

    it('should return not-found when adding a recording to a project in another account', async () => {
      const [project, session] = await harness.loadFixtures([
        fixtures.project.ProjectC_AccountB,
        fixtures.account.AdminUserA_Session,
      ])

      const res = await app.inject({
        method: 'POST',
        url: `/${project.id}/recordings`,
        body: {
          title: 'New Recording',
          url: 'https://example.com',
          description: 'This is a new recording',
          mode: RecordingMode.Replay,
          duration: 30_000,
          browserName: 'Chrome',
          browserVersion: '120.0.0',
          operatingSystem: 'Linux x86_64',
        },
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(404)
      expect(res.json()).not.toMatchObject({
        id: expect.any(String),
        title: 'New Recording',
      })
    })
  })

  describe('Recording data', () => {
    it('should get data for a recording', async () => {
      const [project, recording, data, _, session] = await harness.loadFixtures(
        [
          fixtures.project.ProjectA_Multiple_Recordings,
          fixtures.recording.RecordingA,
          fixtures.recording.RecordingA_Data,
          fixtures.project.UserA_ProjectA_Contributor,
          fixtures.account.UserA_Session,
        ]
      )

      const res = await app.inject({
        method: 'GET',
        url: `/${project.id}/recordings/${recording.id}/data`,
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(200)
      expect(res.body).toEqual(data)
    })

    it('should return not-found when getting data for a recording that does not exist', async () => {
      const [project, session] = await harness.loadFixtures([
        fixtures.project.ProjectA_Multiple_Recordings,
        fixtures.account.AdminUserA_Session,
      ])

      const res = await app.inject({
        method: 'GET',
        url: `/${project.id}/recordings/${encodeId(999)}/data`,
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(404)
    })

    it('should return not-found when getting recording data in a project that does not exist', async () => {
      const [recording, _, session] = await harness.loadFixtures([
        fixtures.recording.RecordingA,
        fixtures.recording.RecordingA_Data,
        fixtures.account.AdminUserA_Session,
      ])

      const res = await app.inject({
        method: 'GET',
        url: `/${encodeId(999)}/recordings/${recording.id}/data`,
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(404)
    })

    it('should return not-found when getting recording data that does not exist', async () => {
      const [project, recording, session] = await harness.loadFixtures([
        fixtures.project.ProjectA_Multiple_Recordings,
        fixtures.recording.RecordingA,
        fixtures.account.AdminUserA_Session,
      ])

      const res = await app.inject({
        method: 'GET',
        url: `/${project.id}/recordings/${recording.id}/data`,
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(404)
    })

    it('should return permission-denied when getting recording data in a project without membership', async () => {
      const [project, recording, _, session] = await harness.loadFixtures([
        fixtures.project.ProjectA_Multiple_Recordings,
        fixtures.recording.RecordingA,
        fixtures.recording.RecordingA_Data,
        fixtures.account.UserA_Session,
      ])

      const res = await app.inject({
        method: 'GET',
        url: `/${project.id}/recordings/${recording.id}/data`,
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(403)
    })

    it('should return not-found when getting recording data in another account', async () => {
      const [project, recording, _, session] = await harness.loadFixtures([
        fixtures.project.ProjectC_AccountB_Multiple_Recordings,
        fixtures.recording.RecordingA,
        fixtures.recording.RecordingA_Data,
        fixtures.account.AdminUserA_Session,
      ])

      const res = await app.inject({
        method: 'GET',
        url: `/${project.id}/recordings/${recording.id}/data`,
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(404)
    })

    it('should write data for a recording', async () => {
      const [project, recording, _, session] = await harness.loadFixtures([
        fixtures.project.ProjectA_Multiple_Recordings,
        fixtures.recording.RecordingA,
        fixtures.project.UserA_ProjectA_Contributor,
        fixtures.account.UserA_Session,
      ])

      const events: Array<SourceEvent> = [
        new Box({
          type: SourceEventType.Interaction,
          time: 0,
          data: new Box({
            type: InteractionType.PointerMove,
            from: [100, 100],
            to: [1000, 1000],
            duration: 25,
          }),
        }),
      ]

      const input = createRecordingDataWireFormat(events)

      const res = await app.inject({
        method: 'PUT',
        url: `/${project.id}/recordings/${recording.id}/data`,
        body: input,
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(204)

      await expect(
        promise(
          harness.services.recordingService
            .readDataAsStream(recording.id)
            .pipe(chain(readableToString))
        )
      ).resolves.toEqual(input)
    })

    it('should return not-found when writing data for a recording that does not exist', async () => {
      const [project, session] = await harness.loadFixtures([
        fixtures.project.ProjectA,
        fixtures.account.AdminUserA_Session,
      ])

      const events: Array<SourceEvent> = [
        new Box({
          type: SourceEventType.Interaction,
          time: 0,
          data: new Box({
            type: InteractionType.PointerMove,
            from: [100, 100],
            to: [1000, 1000],
            duration: 25,
          }),
        }),
      ]

      const input = createRecordingDataWireFormat(events)

      const res = await app.inject({
        method: 'PUT',
        url: `/${project.id}/recordings/${encodeId(999)}/data`,
        body: input,
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(404)

      await expect(
        promise(
          harness.services.recordingService
            .readDataAsStream(encodeId(999))
            .pipe(chain(readableToString))
        )
      ).rejects.toThrow(errorType(notFound()))
    })

    it('should return resource-conflict when attempting to overwrite recording data', async () => {
      const [project, recording, data, session] = await harness.loadFixtures([
        fixtures.project.ProjectA_Multiple_Recordings,
        fixtures.recording.RecordingA,
        fixtures.recording.RecordingA_Data,
        fixtures.account.AdminUserA_Session,
      ])

      const events: Array<SourceEvent> = [
        new Box({
          type: SourceEventType.Interaction,
          time: 0,
          data: new Box({
            type: InteractionType.PointerMove,
            from: [100, 100],
            to: [1000, 1000],
            duration: 25,
          }),
        }),
      ]

      const input = createRecordingDataWireFormat(events)
      expect(input).not.toEqual(data)

      const res = await app.inject({
        method: 'PUT',
        url: `/${project.id}/recordings/${recording.id}/data`,
        body: input,
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(409)

      await expect(
        promise(
          harness.services.recordingService
            .readDataAsStream(recording.id)
            .pipe(chain(readableToString))
        )
      ).resolves.toEqual(data)
    })

    it('should return permission-denied when attempting to write recording data without project membership', async () => {
      const [project, recording, session] = await harness.loadFixtures([
        fixtures.project.ProjectA_Multiple_Recordings,
        fixtures.recording.RecordingA,
        fixtures.account.UserA_Session,
      ])

      const events: Array<SourceEvent> = [
        new Box({
          type: SourceEventType.Interaction,
          time: 0,
          data: new Box({
            type: InteractionType.PointerMove,
            from: [100, 100],
            to: [1000, 1000],
            duration: 25,
          }),
        }),
      ]

      const input = createRecordingDataWireFormat(events)

      const res = await app.inject({
        method: 'PUT',
        url: `/${project.id}/recordings/${recording.id}/data`,
        body: input,
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(403)

      await expect(
        promise(
          harness.services.recordingService
            .readDataAsStream(recording.id)
            .pipe(chain(readableToString))
        )
      ).rejects.toThrow(errorType(notFound()))
    })

    it.todo(
      'should return permission-denied when attempting to write data for a recording created by another user'
    )
  })

  describe('Resources', () => {
    it('should get a resource for a recording', async () => {
      const [project, recording, [resourceId, resource], _, session] =
        await harness.loadFixtures([
          fixtures.project.ProjectA_Multiple_Recordings,
          fixtures.recording.RecordingA,
          fixtures.recording.RecordingA_ResourceA,
          fixtures.project.UserA_ProjectA_Contributor,
          fixtures.account.UserA_Session,
        ])

      const res = await app.inject({
        method: 'GET',
        url: `/${project.id}/recordings/${recording.id}/resources/${resourceId}`,
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(200)
      expect(res.body).toEqual(resource)
    })

    it('should return not-found when getting a resource for a recording that does not exist', async () => {
      const [project, [resourceId, resource], session] =
        await harness.loadFixtures([
          fixtures.project.ProjectA,
          fixtures.recording.RecordingA_ResourceA,
          fixtures.account.AdminUserA_Session,
        ])

      const res = await app.inject({
        method: 'GET',
        url: `/${project.id}/recordings/${encodeId(
          999
        )}/resources/${resourceId}`,
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(404)
      expect(res.body).not.toEqual(resource)
    })

    it('should return not-found when getting a resource in a project that does not exist', async () => {
      const [recording, [resourceId, resource], session] =
        await harness.loadFixtures([
          fixtures.recording.RecordingA,
          fixtures.recording.RecordingA_ResourceA,
          fixtures.account.AdminUserA_Session,
        ])

      const res = await app.inject({
        method: 'GET',
        url: `/${encodeId(999)}/recordings/${
          recording.id
        }/resources/${resourceId}`,
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(404)
      expect(res.body).not.toEqual(resource)
    })

    it('should return permission-denied when getting a resource in a project without membership', async () => {
      const [project, recording, [resourceId, resource], session] =
        await harness.loadFixtures([
          fixtures.project.ProjectA_Multiple_Recordings,
          fixtures.recording.RecordingA,
          fixtures.recording.RecordingA_ResourceA,
          fixtures.account.UserA_Session,
        ])

      const res = await app.inject({
        method: 'GET',
        url: `/${project.id}/recordings/${recording.id}/resources/${resourceId}`,
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(403)
      expect(res.body).not.toEqual(resource)
    })

    it('should return not-found when getting a resource for a project in another account', async () => {
      const [project, recording, [resourceId, resource], session] =
        await harness.loadFixtures([
          fixtures.project.ProjectC_AccountB_Multiple_Recordings,
          fixtures.recording.RecordingA,
          fixtures.recording.RecordingA_ResourceA,
          fixtures.account.UserA_Session,
        ])

      const res = await app.inject({
        method: 'GET',
        url: `/${project.id}/recordings/${recording.id}/resources/${resourceId}`,
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(404)
      expect(res.body).not.toEqual(resource)
    })

    it('should add a resource for a recording', async () => {
      const [project, recording, _, session] = await harness.loadFixtures([
        fixtures.project.ProjectA_Multiple_Recordings,
        fixtures.recording.RecordingA,
        fixtures.project.UserA_ProjectA_Contributor,
        fixtures.account.UserA_Session,
      ])

      const resourceId = encodeId(999)
      const resource = 'data:text/plain,test resource please ignore'

      const res = await app.inject({
        method: 'PUT',
        url: `/${project.id}/recordings/${recording.id}/resources/${resourceId}`,
        body: resource,
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(204)

      await expect(
        promise(
          harness.services.recordingService
            .readResourceAsStream(recording.id, resourceId)
            .pipe(chain(readableToString))
        )
      ).resolves.toEqual(resource)
    })

    it('should return not-found when adding a resource for a recording that does not exist', async () => {
      const [project, session] = await harness.loadFixtures([
        fixtures.project.ProjectA,
        fixtures.account.AdminUserA_Session,
      ])

      const recordingId = encodeId(999)
      const resourceId = encodeId(123)
      const resource = 'data:test/plain,test resource please ignore'

      const res = await app.inject({
        method: 'PUT',
        url: `/${project.id}/recordings/${recordingId}/resources/${resourceId}`,
        body: resource,
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(404)

      await expect(
        promise(
          harness.services.recordingService
            .readResourceAsStream(recordingId, resourceId)
            .pipe(chain(readableToString))
        )
      ).rejects.toThrow(errorType(notFound()))
    })

    it('should return not-found when adding a resource in a project that does not exist', async () => {
      const [recording, session] = await harness.loadFixtures([
        fixtures.recording.RecordingA,
        fixtures.account.AdminUserA_Session,
      ])

      const projectId = encodeId(999)
      const resourceId = encodeId(123)
      const resource = 'data:test/plain,test resource please ignore'

      const res = await app.inject({
        method: 'PUT',
        url: `/${projectId}/recordings/${recording.id}/resources/${resourceId}`,
        body: resource,
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(404)

      await expect(
        promise(
          harness.services.recordingService
            .readResourceAsStream(recording.id, resourceId)
            .pipe(chain(readableToString))
        )
      ).rejects.toThrow(errorType(notFound()))
    })

    it('should return resource-conflict when attempting to overwrite a resource', async () => {
      const [project, recording, [resourceId, resource], session] =
        await harness.loadFixtures([
          fixtures.project.ProjectA_Multiple_Recordings,
          fixtures.recording.RecordingA,
          fixtures.recording.RecordingA_ResourceA,
          fixtures.account.AdminUserA_Session,
        ])

      const newResource = 'data:test/plain,test resource please ignore'

      const res = await app.inject({
        method: 'PUT',
        url: `/${project.id}/recordings/${recording.id}/resources/${resourceId}`,
        body: newResource,
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(409)

      await expect(
        promise(
          harness.services.recordingService
            .readResourceAsStream(recording.id, resourceId)
            .pipe(chain(readableToString))
        )
      ).resolves.toEqual(resource)
    })

    it('should return permission-denied when adding a resource in a project without membership', async () => {
      const [project, recording, session] = await harness.loadFixtures([
        fixtures.project.ProjectA_Multiple_Recordings,
        fixtures.recording.RecordingA,
        fixtures.account.UserA_Session,
      ])

      const resourceId = encodeId(999)
      const resource = 'data:text/plain,test resource please ignore'

      const res = await app.inject({
        method: 'PUT',
        url: `/${project.id}/recordings/${recording.id}/resources/${resourceId}`,
        body: resource,
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(403)

      await expect(
        promise(
          harness.services.recordingService
            .readResourceAsStream(recording.id, resourceId)
            .pipe(chain(readableToString))
        )
      ).rejects.toThrow(errorType(notFound()))
    })

    it.todo(
      'should return permission-denied when adding a resource for a recording created by another user'
    )

    it('should return not-found when adding a resource for a recording in another account', async () => {
      const [project, recording, session] = await harness.loadFixtures([
        fixtures.project.ProjectC_AccountB_Multiple_Recordings,
        fixtures.recording.RecordingA,
        fixtures.account.AdminUserA_Session,
      ])

      const resourceId = encodeId(999)
      const resource = 'data:text/plain,test resource please ignore'

      const res = await app.inject({
        method: 'PUT',
        url: `/${project.id}/recordings/${recording.id}/resources/${resourceId}`,
        body: resource,
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(404)

      await expect(
        promise(
          harness.services.recordingService
            .readResourceAsStream(recording.id, resourceId)
            .pipe(chain(readableToString))
        )
      ).rejects.toThrow(errorType(notFound()))
    })
  })

  describe('Resource maps', () => {
    it('should get a resource-map for a recording', async () => {
      const [project, [recording, resourceMap], _, session] =
        await harness.loadFixtures([
          fixtures.project.ProjectA_Multiple_Recordings,
          fixtures.recording.RecordingA_WithResourceMap,
          fixtures.project.UserA_ProjectA_Contributor,
          fixtures.account.UserA_Session,
        ])

      const res = await app.inject({
        method: 'GET',
        url: `/${project.id}/recordings/${recording.id}/resource-map`,
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(200)
      expect(res.json()).toEqual(resourceMap)
    })

    it('should return not-found when getting the resource-map for a recording that does not exist', async () => {
      const [project, _, session] = await harness.loadFixtures([
        fixtures.project.ProjectA,
        fixtures.project.UserA_ProjectA_Contributor,
        fixtures.account.UserA_Session,
      ])

      const res = await app.inject({
        method: 'GET',
        url: `/${project.id}/recordings/${encodeId(999)}/resource-map`,
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(404)
    })

    it('should return not-found when getting a resource-map in a project that does not exist', async () => {
      const [[recording, resourceMap], session] = await harness.loadFixtures([
        fixtures.recording.RecordingA_WithResourceMap,
        fixtures.account.AdminUserA_Session,
      ])

      const res = await app.inject({
        method: 'GET',
        url: `/${encodeId(999)}/recordings/${recording.id}/resource-map`,
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(404)
      expect(res.json()).not.toEqual(resourceMap)
    })

    it('should return permission-denied when getting a resource-map in a project without membership', async () => {
      const [project, [recording, resourceMap], session] =
        await harness.loadFixtures([
          fixtures.project.ProjectA_Multiple_Recordings,
          fixtures.recording.RecordingA_WithResourceMap,
          fixtures.account.UserA_Session,
        ])

      const res = await app.inject({
        method: 'GET',
        url: `/${project.id}/recordings/${recording.id}/resource-map`,
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(403)
      expect(res.json()).not.toEqual(resourceMap)
    })

    it('should return not-found when getting a resource-map in another account', async () => {
      const [project, [recording, resourceMap], session] =
        await harness.loadFixtures([
          fixtures.project.ProjectC_AccountB_Multiple_Recordings,
          fixtures.recording.RecordingA_WithResourceMap,
          fixtures.account.AdminUserA_Session,
        ])

      const res = await app.inject({
        method: 'GET',
        url: `/${project.id}/recordings/${recording.id}/resource-map`,
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(404)
      expect(res.json()).not.toEqual(resourceMap)
    })

    it('should create a resource-map for a recording', async () => {
      const [project, recording, _, session] = await harness.loadFixtures([
        fixtures.project.ProjectA_Multiple_Recordings,
        fixtures.recording.RecordingA,
        fixtures.project.UserA_ProjectA_Contributor,
        fixtures.account.UserA_Session,
      ])

      const resourceMap: Record<string, string> = {
        [encodeId(123)]: 'https://example.com/foo.png',
        [encodeId(456)]: 'https://example.com/bar.png',
      }

      const res = await app.inject({
        method: 'PUT',
        url: `/${project.id}/recordings/${recording.id}/resource-map`,
        body: resourceMap,
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(204)

      await expect(
        promise(harness.services.recordingService.readResourceMap(recording.id))
      ).resolves.toEqual(resourceMap)
    })

    it('should return not-found when creating a resource map for a recording that does not exist', async () => {
      const [project, _, session] = await harness.loadFixtures([
        fixtures.project.ProjectA,
        fixtures.project.UserA_ProjectA_Contributor,
        fixtures.account.UserA_Session,
      ])

      const recordingId = encodeId(999)
      const resourceMap: Record<string, string> = {
        [encodeId(123)]: 'https://example.com/foo.png',
        [encodeId(456)]: 'https://example.com/bar.png',
      }

      const res = await app.inject({
        method: 'PUT',
        url: `/${project.id}/recordings/${recordingId}/resource-map`,
        body: resourceMap,
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(404)

      await expect(
        promise(harness.services.recordingService.readResourceMap(recordingId))
      ).rejects.toThrow(errorType(notFound()))
    })

    it('should return not-found when creating a resource-map in a project that does not exist', async () => {
      const [recording, session] = await harness.loadFixtures([
        fixtures.recording.RecordingA,
        fixtures.account.UserA_Session,
      ])

      const projectId = encodeId(999)
      const resourceMap: Record<string, string> = {
        [encodeId(123)]: 'https://example.com/foo.png',
        [encodeId(456)]: 'https://example.com/bar.png',
      }

      const res = await app.inject({
        method: 'PUT',
        url: `/${projectId}/recordings/${recording.id}/resource-map`,
        body: resourceMap,
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(404)

      await expect(
        promise(harness.services.recordingService.readResourceMap(recording.id))
      ).resolves.toEqual({})
    })

    it.todo(
      'should return resource-conflict when attempting to overwrite a resource-map'
    )

    it.todo(
      'should return permission-denied when creating a resource-map for a recording created by another user'
    )

    it('should return permission-denied when creating a resource-map in a project without membership', async () => {
      const [project, recording, session] = await harness.loadFixtures([
        fixtures.project.ProjectA_Multiple_Recordings,
        fixtures.recording.RecordingA,
        fixtures.account.UserA_Session,
      ])

      const resourceMap: Record<string, string> = {
        [encodeId(123)]: 'https://example.com/foo.png',
        [encodeId(456)]: 'https://example.com/bar.png',
      }

      const res = await app.inject({
        method: 'PUT',
        url: `/${project.id}/recordings/${recording.id}/resource-map`,
        body: resourceMap,
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(403)

      await expect(
        promise(harness.services.recordingService.readResourceMap(recording.id))
      ).resolves.toEqual({})
    })

    it('should return not-found when creating a resource-map for a recording in another account', async () => {
      const [project, recording, session] = await harness.loadFixtures([
        fixtures.project.ProjectC_AccountB_Multiple_Recordings,
        fixtures.recording.RecordingA,
        fixtures.account.AdminUserA_Session,
      ])

      const resourceMap: Record<string, string> = {
        [encodeId(123)]: 'https://example.com/foo.png',
        [encodeId(456)]: 'https://example.com/bar.png',
      }

      const res = await app.inject({
        method: 'PUT',
        url: `/${project.id}/recordings/${recording.id}/resource-map`,
        body: resourceMap,
        cookies: {
          [harness.env.SESSION_COOKIE]: session.sessionToken,
        },
      })

      expect(res.statusCode).toEqual(404)

      await expect(
        promise(harness.services.recordingService.readResourceMap(recording.id))
      ).resolves.toEqual({})
    })
  })
})
