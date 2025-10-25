import {
  Account,
  Project,
  ProjectRole,
  RecordingInfo,
  User,
} from '@repro/domain'
import { tapF } from '@repro/future-utils'
import { map, parallel, resolve } from 'fluture'
import { Fixture } from '../types'
import {
  AccountA,
  AccountB,
  UserA,
  UserB,
  UserC,
  UserD_AccountB,
} from './account'
import { RecordingA, RecordingB } from './recording'

export const ProjectA: Fixture<Project> = {
  dependencies: [AccountA],
  load: ({ projectService }, account: Account) =>
    projectService.createProject(account.id, 'Project A'),
}

export const ProjectB: Fixture<Project> = {
  dependencies: [AccountA],
  load: ({ projectService }, account: Account) =>
    projectService.createProject(account.id, 'Project B'),
}

export const ProjectC_AccountB: Fixture<Project> = {
  dependencies: [AccountB],
  load: ({ projectService }, account: Account) =>
    projectService.createProject(account.id, 'Project C'),
}

export const UserA_ProjectA_Contributor: Fixture<User> = {
  dependencies: [UserA, ProjectA],
  load: ({ projectService }, user: User, project: Project) =>
    projectService
      .updateUserProjectRole(user.id, project.id, ProjectRole.Contributor)
      .pipe(map(() => user)),
}

export const UserB_ProjectA_Viewer: Fixture<User> = {
  dependencies: [UserB, ProjectA],
  load: ({ projectService }, user: User, project: Project) =>
    projectService
      .updateUserProjectRole(user.id, project.id, ProjectRole.Viewer)
      .pipe(map(() => user)),
}

export const UserC_ProjectA_Admin: Fixture<User> = {
  dependencies: [UserC, ProjectA],
  load: ({ projectService }, user: User, project: Project) =>
    projectService
      .updateUserProjectRole(user.id, project.id, ProjectRole.Admin)
      .pipe(map(() => user)),
}

export const UserD_ProjectC_Contributor: Fixture<User> = {
  dependencies: [UserD_AccountB, ProjectC_AccountB],
  load: ({ projectService }, user: User, project: Project) =>
    projectService
      .updateUserProjectRole(user.id, project.id, ProjectRole.Contributor)
      .pipe(map(() => user)),
}

export const UserA_Multiple_Projects: Fixture<User> = {
  dependencies: [UserA, ProjectA, ProjectB],
  load: (
    { projectService },
    user: User,
    projectA: Project,
    projectB: Project
  ) =>
    resolve(user).pipe(
      tapF(user =>
        parallel(1)(
          [projectA, projectB].map(project =>
            projectService.updateUserProjectRole(
              user.id,
              project.id,
              ProjectRole.Contributor
            )
          )
        )
      )
    ),
}

export const ProjectA_Multiple_Recordings: Fixture<Project> = {
  dependencies: [ProjectA, UserA, RecordingA, RecordingB],
  load: (
    { projectService },
    project: Project,
    author: User,
    recordingA: RecordingInfo,
    recordingB: RecordingInfo
  ) =>
    resolve(project).pipe(
      tapF(project =>
        parallel(2)(
          [recordingA, recordingB].map(recording =>
            projectService.addRecordingToProject(
              project.id,
              recording.id,
              author.id
            )
          )
        )
      )
    ),
}

export const ProjectC_AccountB_Multiple_Recordings: Fixture<Project> = {
  dependencies: [ProjectC_AccountB, UserD_AccountB, RecordingA, RecordingB],
  load: (
    { projectService },
    project: Project,
    author: User,
    recordingA: RecordingInfo,
    recordingB: RecordingInfo
  ) =>
    resolve(project).pipe(
      tapF(project =>
        parallel(2)(
          [recordingA, recordingB].map(recording =>
            projectService.addRecordingToProject(
              project.id,
              recording.id,
              author.id
            )
          )
        )
      )
    ),
}
