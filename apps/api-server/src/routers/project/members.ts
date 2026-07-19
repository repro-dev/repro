import { ProjectRole, StaffUser, User } from '@repro/domain'
import { FastifyPluginAsync } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { go, map, mapRej, parallel } from 'fluture'
import z from 'zod'
import { defaultSystemConfig, SystemConfig } from '~/config/system'
import { AccountService } from '~/services/account'
import { ProjectService } from '~/services/project'
import { badRequest, isPermissionDenied, notFound } from '~/utils/errors'
import { toListResponse } from '~/utils/listResponse'
import { createResponseUtils } from '~/utils/response'
import { ProjectAccess } from './access'

const projectMembersSchema = {
  params: z.object({
    projectId: z.string(),
  }),
} as const

const addProjectMemberSchema = {
  body: z.object({
    userId: z.string(),
    role: z.nativeEnum(ProjectRole),
  }),
  params: z.object({
    projectId: z.string(),
  }),
} as const

const projectMemberSchema = {
  params: z.object({
    projectId: z.string(),
    userId: z.string(),
  }),
} as const

const removeProjectMemberSchema = {
  params: z.object({
    projectId: z.string(),
    userId: z.string(),
  }),
} as const

const updateProjectMemberRoleSchema = {
  body: z.object({
    role: z.nativeEnum(ProjectRole),
  }),
  params: z.object({
    projectId: z.string(),
    userId: z.string(),
  }),
} as const

export function createProjectMembersRouter(
  projectService: ProjectService,
  accountService: AccountService,
  access: ProjectAccess,
  config: SystemConfig = defaultSystemConfig
): FastifyPluginAsync {
  return async function (fastify) {
    const app = fastify.withTypeProvider<ZodTypeProvider>()
    const { respondWith } = createResponseUtils(config)

    app.get<{
      Params: z.infer<typeof projectMembersSchema.params>
    }>(
      '/:projectId/members',

      {
        schema: projectMembersSchema,
      },

      (req, res) => {
        const projectId = req.params.projectId

        respondWith(
          res,
          go(function* () {
            const user: User | StaffUser = yield req.getCurrentUser()
            yield access.ensureCanAccessProject(user, projectId)

            const members: Array<{ userId: string; role: ProjectRole }> =
              yield projectService.getProjectMembers(projectId)

            return yield parallel(Infinity)(
              members.map(member =>
                accountService
                  .getUserById(member.userId)
                  .pipe(map(user => ({ user, role: member.role })))
              )
            )
          }).pipe(map(toListResponse))
        )
      }
    )

    app.post<{
      Body: z.infer<typeof addProjectMemberSchema.body>
      Params: z.infer<typeof addProjectMemberSchema.params>
    }>(
      '/:projectId/members',

      {
        schema: addProjectMemberSchema,
      },

      (req, res) => {
        const projectId = req.params.projectId
        const { userId, role } = req.body
        respondWith(
          res,
          go(function* () {
            const user: User | StaffUser = yield req.getCurrentUser()

            yield access.ensureCanModifyProject(user, projectId)

            yield accountService
              .ensureCanAccessUser(user, userId)
              .pipe(
                mapRej(error =>
                  isPermissionDenied(error)
                    ? badRequest(`Unknown user ID "${userId}"`)
                    : error
                )
              )

            yield projectService.updateUserProjectRole(userId, projectId, role)

            const subjectUser: User = yield accountService.getUserById(userId)

            return {
              user: subjectUser,
              role,
            }
          })
        )
      }
    )

    app.get<{
      Params: z.infer<typeof projectMemberSchema.params>
    }>(
      '/:projectId/members/:userId',

      {
        schema: projectMemberSchema,
      },

      (req, res) => {
        const { projectId, userId } = req.params
        respondWith(
          res,
          go(function* () {
            const user: User | StaffUser = yield req.getCurrentUser()
            yield access.ensureCanAccessProject(user, projectId)

            const role: ProjectRole = yield projectService.getUserProjectRole(
              userId,
              projectId
            )
            const subject: User = yield accountService.getUserById(userId)

            return {
              user: subject,
              role,
            }
          })
        )
      }
    )

    app.delete<{
      Params: z.infer<typeof removeProjectMemberSchema.params>
    }>(
      '/:projectId/members/:userId',

      {
        schema: removeProjectMemberSchema,
      },

      (req, res) => {
        const { projectId, userId } = req.params
        respondWith(
          res,
          go(function* () {
            const user: User | StaffUser = yield req.getCurrentUser()

            yield accountService
              .ensureCanAccessUser(user, userId)
              .pipe(
                mapRej(error =>
                  isPermissionDenied(error) ? notFound() : error
                )
              )

            yield access.ensureCanModifyProject(user, projectId)
            return yield projectService.removeUserFromProject(userId, projectId)
          })
        )
      }
    )

    app.put<{
      Body: z.infer<typeof updateProjectMemberRoleSchema.body>
      Params: z.infer<typeof updateProjectMemberRoleSchema.params>
    }>(
      '/:projectId/members/:userId/role',

      {
        schema: updateProjectMemberRoleSchema,
      },

      (req, res) => {
        const { projectId, userId } = req.params
        const role = req.body.role
        respondWith(
          res,
          go(function* () {
            const user: User | StaffUser = yield req.getCurrentUser()

            yield accountService
              .ensureCanAccessUser(user, userId)
              .pipe(
                mapRej(error =>
                  isPermissionDenied(error) ? notFound() : error
                )
              )

            yield access.ensureCanModifyProject(user, projectId)

            return yield projectService.updateUserProjectRole(
              userId,
              projectId,
              role
            )
          })
        )
      }
    )
  }
}
