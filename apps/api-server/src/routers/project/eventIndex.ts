import { StaffUser, User } from '@repro/domain'
import { FastifyPluginAsync } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { go } from 'fluture'
import z from 'zod'
import { defaultSystemConfig, SystemConfig } from '~/config/system'
import { RecordingService } from '~/services/recording'
import { createResponseUtils } from '~/utils/response'
import { ProjectAccess } from './access'

const updateProjectRecordingEventIndexSchema = {
  body: z.object({
    entries: z.array(
      z.object({
        eventIndex: z.number(),
        eventType: z.number(),
        timeMs: z.number(),
        byteOffset: z.number(),
        byteLength: z.number(),
      })
    ),
  }),
  params: z.object({
    projectId: z.string(),
    recordingId: z.string(),
  }),
} as const

export function createProjectEventIndexRouter(
  recordingService: RecordingService,
  access: ProjectAccess,
  config: SystemConfig = defaultSystemConfig
): FastifyPluginAsync {
  return async function (fastify) {
    const app = fastify.withTypeProvider<ZodTypeProvider>()
    const { respondWith } = createResponseUtils(config)

    app.put<{
      Body: z.infer<typeof updateProjectRecordingEventIndexSchema.body>
      Params: z.infer<typeof updateProjectRecordingEventIndexSchema.params>
    }>(
      '/:projectId/recordings/:recordingId/event-index',

      {
        schema: updateProjectRecordingEventIndexSchema,
      },

      (req, res) => {
        const { projectId, recordingId } = req.params

        respondWith(
          res,
          go<Error, void>(function* () {
            const user: User | StaffUser = yield req.getCurrentUser()
            yield access.ensureCanAccessProjectRecording(
              user,
              projectId,
              recordingId
            )
            return yield recordingService.writeEventIndex(
              recordingId,
              req.body.entries
            )
          }),
          204
        )
      }
    )
  }
}
