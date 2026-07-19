import { StaffUser, User } from '@repro/domain'
import { FastifyPluginAsync } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { go } from 'fluture'
import z from 'zod'
import { defaultSystemConfig, SystemConfig } from '~/config/system'
import { RecordingService } from '~/services/recording'
import { createResponseUtils } from '~/utils/response'
import { ProjectAccess } from './access'

const projectRecordingResourceMapSchema = {
  params: z.object({
    projectId: z.string(),
    recordingId: z.string(),
  }),
} as const

const updateProjectRecordingResourceMapSchema = {
  body: z.record(z.string()),
  params: z.object({
    projectId: z.string(),
    recordingId: z.string(),
  }),
} as const

export function createProjectResourceMapRouter(
  recordingService: RecordingService,
  access: ProjectAccess,
  config: SystemConfig = defaultSystemConfig
): FastifyPluginAsync {
  return async function (fastify) {
    const app = fastify.withTypeProvider<ZodTypeProvider>()
    const { respondWith } = createResponseUtils(config)

    app.get<{
      Params: z.infer<typeof projectRecordingResourceMapSchema.params>
    }>(
      '/:projectId/recordings/:recordingId/resource-map',

      {
        schema: projectRecordingResourceMapSchema,
      },

      (req, res) => {
        const { projectId, recordingId } = req.params

        respondWith(
          res,
          go<Error, Record<string, string>>(function* () {
            const user: User | StaffUser = yield req.getCurrentUser()
            yield access.ensureCanAccessProjectRecording(
              user,
              projectId,
              recordingId
            )
            return yield recordingService.readResourceMap(recordingId)
          })
        )
      }
    )

    app.put<{
      Body: z.infer<typeof updateProjectRecordingResourceMapSchema.body>
      Params: z.infer<typeof updateProjectRecordingResourceMapSchema.params>
    }>(
      '/:projectId/recordings/:recordingId/resource-map',

      {
        schema: updateProjectRecordingResourceMapSchema,
      },

      (req, res) => {
        const { projectId, recordingId } = req.params

        respondWith(
          res,
          go<Error, Record<string, string>>(function* () {
            const user: User | StaffUser = yield req.getCurrentUser()
            yield access.ensureCanAccessProjectRecording(
              user,
              projectId,
              recordingId
            )
            return yield recordingService.writeResourceMap(
              recordingId,
              req.body
            )
          })
        )
      }
    )
  }
}
