import { Account, StaffUser, User } from '@repro/domain'
import { FutureInstance, alt, chain, go, map, mapRej } from 'fluture'
import { AccountService } from '~/services/account'
import { ProjectService } from '~/services/project'
import { isPermissionDenied, notFound } from '~/utils/errors'

export interface ProjectAccess {
  ensureCanAccessProject(
    user: User | StaffUser,
    projectId: string
  ): FutureInstance<Error, User>

  ensureCanModifyProject(
    user: User | StaffUser,
    projectId: string
  ): FutureInstance<Error, User>

  ensureCanAccessProjectRecording(
    user: User | StaffUser,
    projectId: string,
    recordingId: string
  ): FutureInstance<Error, User>

  ensureCanModifyProjectRecording(
    user: User | StaffUser,
    projectId: string,
    recordingId: string
  ): FutureInstance<Error, User>
}

export function createProjectAccess(
  accountService: AccountService,
  projectService: ProjectService
): ProjectAccess {
  function ensureCanAccessProject(
    user: User | StaffUser,
    projectId: string
  ): FutureInstance<Error, User> {
    return go<Error, User>(function* () {
      yield accountService.ensureUser(user)

      const account: Account = yield projectService.getAccountForProject(
        projectId
      )

      yield accountService
        .ensureCanAccessAccount(user, account.id)
        .pipe(mapRej(error => (isPermissionDenied(error) ? notFound() : error)))

      yield alt<Error, void>(
        accountService.ensureUserIsAdmin(user).pipe(map(() => undefined))
      )(projectService.ensureUserCanAccessProject(user.id, projectId))

      return user as User
    })
  }

  function ensureCanModifyProject(
    user: User | StaffUser,
    projectId: string
  ): FutureInstance<Error, User> {
    return go<Error, User>(function* () {
      yield ensureCanAccessProject(user, projectId)
      return yield alt(accountService.ensureUserIsAdmin(user))(
        projectService
          .ensureUserIsProjectAdmin(user.id, projectId)
          .pipe(map(() => user as User))
      )
    })
  }

  function ensureCanAccessProjectRecording(
    user: User | StaffUser,
    projectId: string,
    recordingId: string
  ): FutureInstance<Error, User> {
    return ensureCanAccessProject(user, projectId).pipe(
      chain(user =>
        projectService
          .ensureRecordingBelongsToProject(projectId, recordingId)
          .pipe(map(() => user))
      )
    )
  }

  function ensureCanModifyProjectRecording(
    user: User | StaffUser,
    projectId: string,
    recordingId: string
  ): FutureInstance<Error, User> {
    return ensureCanAccessProjectRecording(user, projectId, recordingId).pipe(
      chain(user => ensureCanModifyProject(user, projectId))
    )
  }

  return {
    ensureCanAccessProject,
    ensureCanModifyProject,
    ensureCanAccessProjectRecording,
    ensureCanModifyProjectRecording,
  }
}
