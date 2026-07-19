import { RecordingMode, StaffUser, User } from '@repro/domain'
import { FastifyPluginAsync } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { go, map } from 'fluture'
import z from 'zod'
import { createEnv } from '~/config/createEnv'
import { defaultSystemConfig, SystemConfig } from '~/config/system'
import { uploadRateLimitOptions } from '~/rateLimit'
import { ProjectService } from '~/services/project'
import { RecordingService } from '~/services/recording'
import { ShareService } from '~/services/share'
import { toListResponse } from '~/utils/listResponse'
import { createResponseUtils } from '~/utils/response'
import { ProjectAccess } from './access'

const projectRecordingsSchema = {
  params: z.object({
    projectId: z.string(),
  }),
} as const

const projectRecordingInfoSchema = {
  params: z.object({
    projectId: z.string(),
    recordingId: z.string(),
  }),
} as const

const createProjectRecordingSchema = {
  body: z.object({
    title: z.string(),
    url: z.string().url(),
    description: z.string(),
    mode: z.nativeEnum(RecordingMode),
    duration: z.number(),
    browserName: z.string().nullable(),
    browserVersion: z.string().nullable(),
    operatingSystem: z.string().nullable(),
  }),
  params: z.object({
    projectId: z.string(),
  }),
} as const

const projectRecordingDataSchema = {
  params: z.object({
    projectId: z.string(),
    recordingId: z.string(),
  }),
} as const

const updateProjectRecordingDataSchema = {
  params: z.object({
    projectId: z.string(),
    recordingId: z.string(),
  }),
} as const

const deleteProjectRecordingSchema = {
  params: z.object({
    projectId: z.string(),
    recordingId: z.string(),
  }),
} as const

const createShareSchema = {
  params: z.object({
    projectId: z.string(),
    recordingId: z.string(),
  }),
  body: z.object({
    expiresAt: z.string().datetime().nullable().optional(),
  }),
} as const

const listSharesSchema = {
  params: z.object({
    projectId: z.string(),
    recordingId: z.string(),
  }),
} as const

const revokeShareSchema = {
  params: z.object({
    projectId: z.string(),
    recordingId: z.string(),
    tokenId: z.string(),
  }),
} as const

export function createProjectRecordingsRouter(
  projectService: ProjectService,
  recordingService: RecordingService,
  access: ProjectAccess,
  shareService?: ShareService,
  config: SystemConfig = defaultSystemConfig
): FastifyPluginAsync {
  return async function (fastify) {
    const app = fastify.withTypeProvider<ZodTypeProvider>()
    const { respondWith } = createResponseUtils(config)
    const env = createEnv()

    app.get<{
      Params: z.infer<typeof projectRecordingsSchema.params>
    }>(
      '/:projectId/recordings',

      {
        schema: projectRecordingsSchema,
      },

      (req, res) => {
        const { projectId } = req.params
        respondWith(
          res,
          go(function* () {
            const user: User | StaffUser = yield req.getCurrentUser()
            yield access.ensureCanAccessProject(user, projectId)
            return yield projectService.getRecordingsForProject(projectId)
          }).pipe(map(toListResponse))
        )
      }
    )

    app.get<{
      Params: z.infer<typeof projectRecordingInfoSchema.params>
    }>(
      '/:projectId/recordings/:recordingId/info',

      {
        schema: projectRecordingInfoSchema,
      },

      (req, res) => {
        const { projectId, recordingId } = req.params

        respondWith(
          res,
          go(function* () {
            const user: User | StaffUser = yield req.getCurrentUser()
            yield access.ensureCanAccessProjectRecording(
              user,
              projectId,
              recordingId
            )
            return yield recordingService.readInfo(recordingId)
          })
        )
      }
    )

    app.post<{
      Body: z.infer<typeof createProjectRecordingSchema.body>
      Params: z.infer<typeof createProjectRecordingSchema.params>
    }>(
      '/:projectId/recordings',

      {
        schema: createProjectRecordingSchema,
      },

      (req, res) => {
        const { projectId } = req.params

        respondWith(
          res,
          go(function* () {
            const user: User | StaffUser = yield req.getCurrentUser()
            yield access.ensureCanAccessProject(user, projectId)
            return yield projectService.createRecordingForProject(
              projectId,
              user.id,
              req.body
            )
          }),
          201
        )
      }
    )

    app.get<{
      Params: z.infer<typeof projectRecordingDataSchema.params>
    }>(
      '/:projectId/recordings/:recordingId/data',

      {
        schema: projectRecordingDataSchema,
        compress: false,
      },

      (req, res) => {
        const { projectId, recordingId } = req.params

        respondWith(
          res,
          go(function* () {
            const user: User | StaffUser = yield req.getCurrentUser()
            yield access.ensureCanAccessProjectRecording(
              user,
              projectId,
              recordingId
            )
            return yield recordingService.readDataAsStream(recordingId)
          })
        )
      }
    )

    app.put<{
      Params: z.infer<typeof updateProjectRecordingDataSchema.params>
    }>(
      '/:projectId/recordings/:recordingId/data',

      {
        schema: updateProjectRecordingDataSchema,
        config: {
          rateLimit: uploadRateLimitOptions(env.RATE_LIMIT_UPLOAD_RPM),
        },
      },

      (req, res) => {
        const { projectId, recordingId } = req.params

        respondWith(
          res,
          go(function* () {
            const user: User | StaffUser = yield req.getCurrentUser()
            yield access.ensureCanAccessProjectRecording(
              user,
              projectId,
              recordingId
            )
            return yield recordingService.writeDataFromStream(
              recordingId,
              req.raw
            )
          })
        )
      }
    )

    app.delete(
      '/:projectId/recordings/:recordingId',

      {
        schema: deleteProjectRecordingSchema,
      },

      (req, res) => {
        const { projectId, recordingId } = req.params

        respondWith(
          res,
          go<Error, void>(function* () {
            const user: User | StaffUser = yield req.getCurrentUser()
            yield access.ensureCanModifyProjectRecording(
              user,
              projectId,
              recordingId
            )
            return yield recordingService.deleteRecording(
              projectId,
              recordingId
            )
          }),
          204
        )
      }
    )

    // --- Share routes ---

    app.post<{
      Params: z.infer<typeof createShareSchema.params>
      Body: z.infer<typeof createShareSchema.body>
    }>(
      '/:projectId/recordings/:recordingId/share',

      {
        schema: createShareSchema,
      },

      (req, res) => {
        const { projectId, recordingId } = req.params
        const expiresAt = req.body.expiresAt ?? null

        respondWith(
          res,
          go(function* () {
            const user: User | StaffUser = yield req.getCurrentUser()
            yield access.ensureCanAccessProjectRecording(
              user,
              projectId,
              recordingId
            )

            if (!shareService) {
              throw new Error('Share service not available')
            }

            return yield shareService.createShareToken(
              'recording',
              recordingId,
              user.id,
              expiresAt
            )
          }),
          201
        )
      }
    )

    app.get<{
      Params: z.infer<typeof listSharesSchema.params>
    }>(
      '/:projectId/recordings/:recordingId/shares',

      {
        schema: listSharesSchema,
      },

      (req, res) => {
        const { projectId, recordingId } = req.params

        respondWith(
          res,
          go(function* () {
            const user: User | StaffUser = yield req.getCurrentUser()
            yield access.ensureCanAccessProjectRecording(
              user,
              projectId,
              recordingId
            )

            if (!shareService) {
              throw new Error('Share service not available')
            }

            return yield shareService.listShareTokens('recording', recordingId)
          }).pipe(map(toListResponse))
        )
      }
    )

    app.delete<{
      Params: z.infer<typeof revokeShareSchema.params>
    }>(
      '/:projectId/recordings/:recordingId/share/:tokenId',

      {
        schema: revokeShareSchema,
      },

      (req, res) => {
        const { projectId, recordingId, tokenId } = req.params

        respondWith(
          res,
          go(function* () {
            const user: User | StaffUser = yield req.getCurrentUser()
            yield access.ensureCanAccessProjectRecording(
              user,
              projectId,
              recordingId
            )

            if (!shareService) {
              throw new Error('Share service not available')
            }

            return yield shareService.revokeShareToken(
              tokenId,
              recordingId,
              user.id
            )
          })
        )
      }
    )
  }
}
