import { Account, Project, ProjectRole, StaffUser, User } from '@repro/domain'
import { FastifyPluginAsync } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { chain, go, map, reject } from 'fluture'
import z from 'zod'
import { defaultSystemConfig, SystemConfig } from '~/config/system'
import { AccountService } from '~/services/account'
import { ProjectService } from '~/services/project'
import { RecordingService } from '~/services/recording'
import { ShareService } from '~/services/share'
import { notImplemented } from '~/utils/errors'
import { toListResponse } from '~/utils/listResponse'
import { createResponseUtils } from '~/utils/response'
import { createProjectAccess } from './access'
import { createProjectEventIndexRouter } from './eventIndex'
import { createProjectMembersRouter } from './members'
import { createProjectRecordingsRouter } from './recordings'
import { createProjectResourceMapRouter } from './resourceMap'
import { createProjectResourcesRouter } from './resources'

const createProjectSchema = {
  body: z.object({
    name: z.string(),
  }),
} as const

const projectIdSchema = {
  params: z.object({
    projectId: z.string(),
  }),
} as const

const updateProjectActiveSchema = {
  body: z.object({
    active: z.boolean(),
  }),
  params: z.object({
    projectId: z.string(),
  }),
} as const

const updateProjectNameSchema = {
  body: z.object({
    name: z.string(),
  }),
  params: z.object({
    projectId: z.string(),
  }),
} as const

export function createProjectRouter(
  projectService: ProjectService,
  recordingService: RecordingService,
  accountService: AccountService,
  config: SystemConfig = defaultSystemConfig,
  shareService?: ShareService
): FastifyPluginAsync {
  return async function (fastify) {
    const app = fastify.withTypeProvider<ZodTypeProvider>()
    const { respondWith } = createResponseUtils(config)

    const access = createProjectAccess(accountService, projectService)

    await app.register(
      createProjectMembersRouter(projectService, accountService, access, config)
    )
    await app.register(
      createProjectRecordingsRouter(
        projectService,
        recordingService,
        access,
        shareService,
        config
      )
    )
    await app.register(
      createProjectResourcesRouter(recordingService, access, config)
    )
    await app.register(
      createProjectResourceMapRouter(recordingService, access, config)
    )
    await app.register(
      createProjectEventIndexRouter(recordingService, access, config)
    )

    // --- Project-core routes ---

    app.get('/', (req, res) => {
      respondWith(
        res,
        go(function* () {
          const user: User | StaffUser = yield req.getCurrentUser()
          yield accountService.ensureUser(user)
          return yield projectService.getUserProjects(user.id)
        }).pipe(map(toListResponse))
      )
    })

    app.post<{
      Body: z.infer<typeof createProjectSchema.body>
    }>(
      '/',

      {
        schema: createProjectSchema,
      },

      (req, res) => {
        respondWith(
          res,
          go(function* () {
            const user: User | StaffUser = yield req.getCurrentUser()

            yield accountService.ensureUser(user)

            const account: Account = yield accountService.getAccountForUser(
              user.id
            )

            const project: Project = yield projectService.createProject(
              account.id,
              req.body.name
            )

            yield projectService.updateUserProjectRole(
              user.id,
              project.id,
              ProjectRole.Admin
            )

            return project
          }),
          201
        )
      }
    )

    app.get<{
      Params: z.infer<typeof projectIdSchema.params>
    }>(
      '/:projectId',

      {
        schema: projectIdSchema,
      },

      (req, res) => {
        const { projectId } = req.params
        respondWith(
          res,
          go(function* () {
            const user: User | StaffUser = yield req.getCurrentUser()
            yield access.ensureCanAccessProject(user, projectId)
            return yield projectService.getProjectById(projectId)
          })
        )
      }
    )

    app.put<{
      Body: z.infer<typeof updateProjectActiveSchema.body>
      Params: z.infer<typeof updateProjectActiveSchema.params>
    }>(
      '/:projectId/active',

      {
        schema: updateProjectActiveSchema,
      },

      (req, res) => {
        const active = req.body.active
        const projectId = req.params.projectId

        respondWith(
          res,
          req
            .getCurrentUser()
            .pipe(chain(user => access.ensureCanModifyProject(user, projectId)))
            .pipe(
              chain(() =>
                active
                  ? reject(notImplemented())
                  : projectService.deactivateProject(projectId)
              )
            )
        )
      }
    )

    app.put<{
      Body: z.infer<typeof updateProjectNameSchema.body>
      Params: z.infer<typeof updateProjectNameSchema.params>
    }>(
      '/:projectId/name',

      {
        schema: updateProjectNameSchema,
      },

      (req, res) => {
        const name = req.body.name
        const projectId = req.params.projectId

        respondWith(
          res,
          req
            .getCurrentUser()
            .pipe(chain(user => access.ensureCanModifyProject(user, projectId)))
            .pipe(
              chain(() => projectService.updateProjectName(projectId, name))
            )
        )
      }
    )
  }
}
