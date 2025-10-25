import { ProjectRole } from '@repro/domain'
import expect from 'expect'
import { promise } from 'fluture'
import { after, before, beforeEach, describe, it } from 'node:test'
import { encodeId } from '~/modules/database'
import { Harness, createTestHarness, fixtures } from '~/testing'
import { notFound, permissionDenied } from '~/utils/errors'
import { ProjectService } from './project'

describe('Services > Project', () => {
  let harness: Harness
  let projectService: ProjectService

  before(async () => {
    harness = await createTestHarness()
    projectService = harness.services.projectService
  })

  beforeEach(async () => {
    await harness.reset()
  })

  after(async () => {
    await harness.close()
  })

  it('should create a new project', async () => {
    const [account] = await harness.loadFixtures([fixtures.account.AccountA])

    await expect(
      promise(projectService.createProject(account.id, 'New Project'))
    ).resolves.toMatchObject({
      id: expect.any(String),
      name: 'New Project',
    })
  })

  it('should deactivate a project', async () => {
    const [account] = await harness.loadFixtures([fixtures.account.AccountA])

    const project = await promise(
      projectService.createProject(account.id, 'New Project')
    )

    await promise(projectService.deactivateProject(project.id))

    await expect(
      promise(projectService.getProjectById(project.id))
    ).rejects.toThrow(notFound())
  })

  it('should throw not-found when deactivating a project that does not exist', async () => {
    await expect(
      promise(projectService.deactivateProject(encodeId(999)))
    ).rejects.toThrow(notFound())
  })

  it('should update a project name', async () => {
    const [account] = await harness.loadFixtures([fixtures.account.AccountA])

    const project = await promise(
      projectService.createProject(account.id, 'New Project')
    )

    await promise(
      projectService.updateProjectName(project.id, 'Renamed Project')
    )

    await expect(
      promise(projectService.getProjectById(project.id))
    ).resolves.toMatchObject({
      id: project.id,
      name: 'Renamed Project',
    })
  })

  it('should throw not-found when updating the name of a project that does not exist', async () => {
    await expect(
      promise(
        projectService.updateProjectName(encodeId(999), 'Renamed Project')
      )
    ).rejects.toThrow(notFound())
  })

  it('should should add a user to a project', async () => {
    const [project, user] = await harness.loadFixtures([
      fixtures.project.ProjectA,
      fixtures.account.UserA,
    ])

    await expect(
      promise(
        projectService.updateUserProjectRole(
          user.id,
          project.id,
          ProjectRole.Contributor
        )
      )
    ).resolves.toBeUndefined()

    await expect(
      promise(projectService.getUserProjects(user.id))
    ).resolves.toEqual([project])
  })

  it('should remove a user from a project', async () => {
    const [project, user] = await harness.loadFixtures([
      fixtures.project.ProjectA,
      fixtures.project.UserA_ProjectA_Contributor,
    ])

    await expect(
      promise(projectService.getUserProjects(user.id))
    ).resolves.toEqual([project])

    await expect(
      promise(projectService.removeUserFromProject(user.id, project.id))
    ).resolves.toBeUndefined()

    await expect(
      promise(projectService.getUserProjects(user.id))
    ).resolves.toEqual([])
  })

  it('should change the role of a user in a project', async () => {
    const [project, user] = await harness.loadFixtures([
      fixtures.project.ProjectA,
      fixtures.project.UserA_ProjectA_Contributor,
    ])

    await expect(
      promise(projectService.getUserProjectRole(user.id, project.id))
    ).resolves.toEqual(ProjectRole.Contributor)

    await expect(
      promise(
        projectService.updateUserProjectRole(
          user.id,
          project.id,
          ProjectRole.Admin
        )
      )
    ).resolves.toBeUndefined()

    await expect(
      promise(projectService.getUserProjectRole(user.id, project.id))
    ).resolves.toEqual(ProjectRole.Admin)
  })

  it('should get all projects for a user', async () => {
    const [user, projectA, projectB] = await harness.loadFixtures([
      fixtures.project.UserA_Multiple_Projects,
      fixtures.project.ProjectA,
      fixtures.project.ProjectB,
    ])

    await expect(
      promise(projectService.getUserProjects(user.id))
    ).resolves.toEqual([projectB, projectA])
  })

  it('should get a project by ID', async () => {
    const [project] = await harness.loadFixtures([fixtures.project.ProjectA])

    await expect(
      promise(projectService.getProjectById(project.id))
    ).resolves.toEqual(project)
  })

  it('should get all recordings for a project', async () => {
    const [project, recordingA, recordingB] = await harness.loadFixtures([
      fixtures.project.ProjectA_Multiple_Recordings,
      fixtures.recording.RecordingA,
      fixtures.recording.RecordingB,
    ])

    const recordings = await promise(
      projectService.getRecordingsForProject(project.id)
    )

    expect(recordings).toEqual(
      [recordingA, recordingB].sort(
        (a, b) => -a.createdAt.localeCompare(b.createdAt)
      )
    )
  })

  it('should throw not-found when getting a project that does not exist', async () => {
    await expect(
      promise(projectService.getProjectById(encodeId(999)))
    ).rejects.toThrow(notFound())
  })

  it('should ensure that a user can access a project', async () => {
    const [projectA, projectB, user] = await harness.loadFixtures([
      fixtures.project.ProjectA,
      fixtures.project.ProjectB,
      fixtures.project.UserA_ProjectA_Contributor,
    ])

    await expect(
      promise(projectService.ensureUserCanAccessProject(user.id, projectA.id))
    ).resolves.toBeUndefined()

    await expect(
      promise(projectService.ensureUserCanAccessProject(user.id, projectB.id))
    ).rejects.toThrow(permissionDenied())
  })

  it('should ensure that a user is a project contributor', async () => {
    const [project, userA, userB, userC] = await harness.loadFixtures([
      fixtures.project.ProjectA,
      fixtures.project.UserA_ProjectA_Contributor,
      fixtures.project.UserB_ProjectA_Viewer,
      fixtures.project.UserC_ProjectA_Admin,
    ])

    await expect(
      promise(
        projectService.ensureUserIsProjectContributor(userA.id, project.id)
      )
    ).resolves.toBeUndefined()

    await expect(
      promise(
        projectService.ensureUserIsProjectContributor(userB.id, project.id)
      )
    ).rejects.toThrow(permissionDenied())

    await expect(
      promise(
        projectService.ensureUserIsProjectContributor(userC.id, project.id)
      )
    ).resolves.toBeUndefined()
  })

  it('should ensure that a user is a project admin', async () => {
    const [project, userA, userB, userC] = await harness.loadFixtures([
      fixtures.project.ProjectA,
      fixtures.project.UserA_ProjectA_Contributor,
      fixtures.project.UserB_ProjectA_Viewer,
      fixtures.project.UserC_ProjectA_Admin,
    ])

    await expect(
      promise(projectService.ensureUserIsProjectAdmin(userA.id, project.id))
    ).rejects.toThrow(permissionDenied())

    await expect(
      promise(projectService.ensureUserIsProjectAdmin(userB.id, project.id))
    ).rejects.toThrow(permissionDenied())

    await expect(
      promise(projectService.ensureUserIsProjectAdmin(userC.id, project.id))
    ).resolves.toBeUndefined()
  })
})
