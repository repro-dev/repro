import { StaffUser, User } from '@repro/domain'
import { FastifyPluginAsync } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { go } from 'fluture'
import z from 'zod'
import { defaultSystemConfig, SystemConfig } from '~/config/system'
import { RecordingService } from '~/services/recording'
import { createResponseUtils } from '~/utils/response'
import { ProjectAccess } from './access'

const projectRecordingResourceSchema = {
  params: z.object({
    projectId: z.string(),
    recordingId: z.string(),
    resourceId: z.string(),
  }),
} as const

const updateProjectRecordingResourceSchema = {
  params: z.object({
    projectId: z.string(),
    recordingId: z.string(),
    resourceId: z.string(),
  }),
} as const

export function createProjectResourcesRouter(
  recordingService: RecordingService,
  access: ProjectAccess,
  config: SystemConfig = defaultSystemConfig
): FastifyPluginAsync {
  return async function (fastify) {
    const app = fastify.withTypeProvider<ZodTypeProvider>()
    const { respondWith } = createResponseUtils(config)

    app.get<{
      Params: z.infer<typeof projectRecordingResourceSchema.params>
    }>(
      '/:projectId/recordings/:recordingId/resources/:resourceId',

      {
        schema: projectRecordingResourceSchema,
      },

      (req, res) => {
        const { projectId, recordingId, resourceId } = req.params

        respondWith(
          res,
          // TODO: check the performance cost of checking access controls
          go(function* () {
            const user: User | StaffUser = yield req.getCurrentUser()
            yield access.ensureCanAccessProjectRecording(
              user,
              projectId,
              recordingId
            )
            return yield recordingService.readResourceAsStream(
              recordingId,
              resourceId
            )
          })
        )
      }
    )

    app.put<{
      Params: z.infer<typeof updateProjectRecordingResourceSchema.params>
    }>(
      '/:projectId/recordings/:recordingId/resources/:resourceId',

      {
        schema: updateProjectRecordingResourceSchema,
      },

      (req, res) => {
        const { projectId, recordingId, resourceId } = req.params

        respondWith(
          res,
          go(function* () {
            const user: User | StaffUser = yield req.getCurrentUser()
            yield access.ensureCanAccessProjectRecording(
              user,
              projectId,
              recordingId
            )
            return yield recordingService.writeResourceFromStream(
              recordingId,
              resourceId,
              req.raw
            )
          })
        )
      }
    )
  }
}
