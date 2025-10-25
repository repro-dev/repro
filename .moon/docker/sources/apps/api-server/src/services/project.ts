import { Account, Project, ProjectRole, RecordingInfo } from '@repro/domain'
import {
  FutureInstance,
  bimap,
  chain,
  map,
  mapRej,
  reject,
  resolve,
} from 'fluture'
import { SystemConfig, defaultSystemConfig } from '~/config/system'
import {
  Database,
  attemptQuery,
  decodeId,
  encodeId,
  withEncodedId,
} from '~/modules/database'
import { badRequest, notFound, permissionDenied } from '~/utils/errors'

export function createProjectService(
  database: Database,
  _config: SystemConfig = defaultSystemConfig
) {
  function createProject(
    accountId: string,
    name: string
  ): FutureInstance<Error, Project> {
    const decodedAccountId = decodeId(accountId)

    if (decodedAccountId == null) {
      return reject(badRequest('Invalid account ID'))
    }

    return attemptQuery(() => {
      return database
        .insertInto('projects')
        .values({ accountId: decodedAccountId, name })
        .returning(['id', 'name'])
        .executeTakeFirstOrThrow()
    }).pipe(map(withEncodedId))
  }

  function getProjectById(projectId: string): FutureInstance<Error, Project> {
    return attemptQuery(() => {
      return database
        .selectFrom('projects')
        .select(['id', 'name'])
        .where('id', '=', decodeId(projectId))
        .where('active', '=', 1)
        .executeTakeFirstOrThrow(() => notFound())
    }).pipe(map(withEncodedId))
  }

  function deactivateProject(projectId: string): FutureInstance<Error, void> {
    return getProjectById(projectId).pipe(
      chain(() =>
        attemptQuery(async () => {
          await database
            .updateTable('projects')
            .set('active', 0)
            .where('id', '=', decodeId(projectId))
            .execute()
        })
      )
    )
  }

  function updateProjectName(
    projectId: string,
    name: string
  ): FutureInstance<Error, void> {
    return getProjectById(projectId).pipe(
      chain(() =>
        attemptQuery(async () => {
          await database
            .updateTable('projects')
            .set('name', name)
            .where('id', '=', decodeId(projectId))
            .execute()
        })
      )
    )
  }

  function getUserProjectRole(
    userId: string,
    projectId: string
  ): FutureInstance<Error, ProjectRole> {
    return attemptQuery(() => {
      return database
        .selectFrom('memberships')
        .select('role')
        .where('userId', '=', decodeId(userId))
        .where('projectId', '=', decodeId(projectId))
        .executeTakeFirstOrThrow(() => notFound())
    }).pipe(map(row => row.role))
  }

  function updateUserProjectRole(
    userId: string,
    projectId: string,
    role: ProjectRole
  ): FutureInstance<Error, void> {
    const decodedUserId = decodeId(userId)

    if (decodedUserId == null) {
      return reject(badRequest('Invalid user ID'))
    }

    const decodedProjectId = decodeId(projectId)

    if (decodedProjectId == null) {
      return reject(badRequest('Invalid project ID'))
    }

    return attemptQuery(async () => {
      await database
        .insertInto('memberships')
        .values({
          userId: decodedUserId,
          projectId: decodedProjectId,
          role,
        })
        .onConflict(oc =>
          oc.columns(['userId', 'projectId']).doUpdateSet({ role })
        )
        .execute()
    })
  }

  function removeUserFromProject(
    userId: string,
    projectId: string
  ): FutureInstance<Error, void> {
    return attemptQuery(async () => {
      await database
        .deleteFrom('memberships')
        .where('userId', '=', decodeId(userId))
        .where('projectId', '=', decodeId(projectId))
        .execute()
    })
  }

  function getUserProjects(
    userId: string
  ): FutureInstance<Error, Array<Project>> {
    return attemptQuery(() => {
      return database
        .selectFrom('memberships as m')
        .innerJoin('projects as p', 'p.id', 'm.projectId')
        .select(['p.id', 'p.name'])
        .where('m.userId', '=', decodeId(userId))
        .where('p.active', '=', 1)
        .orderBy('p.createdAt desc')
        .execute()
    }).pipe(map(rows => rows.map(withEncodedId)))
  }

  function getProjectMembers(
    projectId: string
  ): FutureInstance<Error, Array<{ userId: string; role: ProjectRole }>> {
    return attemptQuery(() => {
      return database
        .selectFrom('memberships')
        .select(['userId', 'role'])
        .where('projectId', '=', decodeId(projectId))
        .execute()
    }).pipe(
      map(rows =>
        rows.map(row => ({
          userId: encodeId(row.userId),
          role: row.role,
        }))
      )
    )
  }

  function ensureUserCanAccessProject(
    userId: string,
    projectId: string
  ): FutureInstance<Error, void> {
    return getUserProjectRole(userId, projectId).pipe(
      bimap(() => permissionDenied())(() => undefined)
    )
  }

  function ensureUserIsProjectContributor(
    userId: string,
    projectId: string
  ): FutureInstance<Error, void> {
    return getUserProjectRole(userId, projectId)
      .pipe(mapRej(() => permissionDenied()))
      .pipe(
        chain(role =>
          role === ProjectRole.Admin || role === ProjectRole.Contributor
            ? resolve(undefined)
            : reject(permissionDenied())
        )
      )
  }

  function ensureUserIsProjectAdmin(
    userId: string,
    projectId: string
  ): FutureInstance<Error, void> {
    return getUserProjectRole(userId, projectId)
      .pipe(mapRej(() => permissionDenied()))
      .pipe(
        chain(role =>
          role === ProjectRole.Admin
            ? resolve(undefined)
            : reject(permissionDenied())
        )
      )
  }

  function getRecordingsForProject(
    projectId: string
  ): FutureInstance<Error, Array<RecordingInfo>> {
    return attemptQuery(() => {
      return database
        .selectFrom('project_recordings as pr')
        .innerJoin('recordings as r', 'r.id', 'pr.recordingId')
        .selectAll('r')
        .where('pr.projectId', '=', decodeId(projectId))
        .orderBy('r.createdAt desc')
        .execute()
    }).pipe(
      map(rows =>
        rows.map(row => ({
          ...withEncodedId(row),
          createdAt: row.createdAt.toISOString(),
        }))
      )
    )
  }

  function addRecordingToProject(
    projectId: string,
    recordingId: string,
    authorId: string
  ): FutureInstance<Error, void> {
    const decodedRecordingId = decodeId(recordingId)

    if (decodedRecordingId == null) {
      return reject(badRequest('Invalid recording ID'))
    }

    const decodedProjectId = decodeId(projectId)

    if (decodedProjectId == null) {
      return reject(badRequest('Invalid project ID'))
    }

    const decodedAuthorId = decodeId(authorId)

    if (decodedAuthorId == null) {
      return reject(badRequest('Invalid author ID'))
    }

    return attemptQuery(async () => {
      await database
        .insertInto('project_recordings')
        .values({
          recordingId: decodedRecordingId,
          projectId: decodedProjectId,
          authorId: decodedAuthorId,
        })
        .execute()
    })
  }

  function getAccountForProject(
    projectId: string
  ): FutureInstance<Error, Account> {
    return attemptQuery(() => {
      return database
        .selectFrom('projects as p')
        .innerJoin('accounts as a', 'a.id', 'p.accountId')
        .select(['a.id', 'a.name'])
        .where('p.id', '=', decodeId(projectId))
        .executeTakeFirstOrThrow(() => notFound())
    }).pipe(map(withEncodedId))
  }

  return {
    // Access control
    ensureUserCanAccessProject,
    ensureUserIsProjectContributor,
    ensureUserIsProjectAdmin,

    // Queries
    getProjectById,
    getUserProjectRole,
    getUserProjects,
    getRecordingsForProject,
    getAccountForProject,
    getProjectMembers,

    // Mutations
    createProject,
    deactivateProject,
    updateProjectName,
    updateUserProjectRole,
    removeUserFromProject,
    addRecordingToProject,
  }
}

export type ProjectService = ReturnType<typeof createProjectService>
