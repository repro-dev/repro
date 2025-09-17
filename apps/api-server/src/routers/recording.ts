import { RecordingMode, StaffUser, User } from '@repro/domain'
import { parseSchema } from '@repro/validation'
import { FastifyPluginAsync } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { FutureInstance, alt, bimap, chain, go } from 'fluture'
import z from 'zod'
import { defaultSystemConfig } from '~/config/system'
import { AccountService } from '~/services/account'
import type { RecordingService } from '~/services/recording'
import { isPermissionDenied, notFound } from '~/utils/errors'
import { createResponseUtils } from '~/utils/response'

const recordingIdSchema = {
  params: z.object({
    recordingId: z.string(),
  }),
} as const

const recordingResourceSchema = {
  params: z.object({
    recordingId: z.string(),
    resourceId: z.string(),
  }),
} as const

const writeResourceMapSchema = {
  body: z.record(z.string()),
  params: z.object({
    recordingId: z.string(),
  }),
} as const

const createRecordingSchema = {
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
} as const

export function createRecordingRouter(
  recordingService: RecordingService,
  accountService: AccountService,
  config = defaultSystemConfig
): FastifyPluginAsync {
  const { respondWith } = createResponseUtils(config)

  return async function (fastify) {
    const app = fastify.withTypeProvider<ZodTypeProvider>()

    // FIXME: Only allow write access to staff users.
    // Bare public recordings will be created as project demos.
    // Users will be able to create public recordings only for their own projects.
    function ensureCanWriteRecording(
      user: User | StaffUser
    ): FutureInstance<Error, StaffUser> {
      return accountService.ensureStaffUser(user)
    }

    function ensureCanAccessRecording(
      user: User | StaffUser | null,
      recordingId: string
    ): FutureInstance<Error, User | StaffUser | null> {
      return alt(
        recordingService.ensureIsPublicRecording(recordingId).pipe(
          bimap<Error, Error>(error =>
            // Throw "not-found" to avoid leaking existence of private recording
            isPermissionDenied(error) ? notFound() : error
          )(() => user)
        )
      )(accountService.ensureStaffUser(user))
    }

    app.get('/', (req, res) => {
      respondWith(
        res,
        go(function* () {
          const user: User | StaffUser = yield req.getCurrentUser()
          yield accountService.ensureStaffUser(user)
          return yield recordingService.listInfo()
        })
      )
    })

    app.get<{
      Params: z.infer<typeof recordingIdSchema.params>
    }>(
      '/:recordingId/data',
      {
        schema: recordingIdSchema,
      },
      (req, res) => {
        const { recordingId } = req.params
        res.header('Content-Encoding', 'gzip')
        respondWith(
          res,
          go(function* () {
            const user = yield req.getCurrentUserOrNull()
            yield ensureCanAccessRecording(user, recordingId)
            return yield recordingService.readDataAsStream(recordingId)
          })
        )
      }
    )

    app.put<{
      Params: z.infer<typeof recordingIdSchema.params>
    }>(
      '/:recordingId/data',
      {
        schema: recordingIdSchema,
      },
      (req, res) => {
        const { recordingId } = req.params
        respondWith(
          res,
          go(function* () {
            const user = yield req.getCurrentUserOrNull()
            yield ensureCanWriteRecording(user)
            return yield recordingService.writeDataFromStream(
              recordingId,
              req.raw
            )
          }),
          201
        )
      }
    )

    app.get<{
      Params: z.infer<typeof recordingResourceSchema.params>
    }>(
      '/:recordingId/resources/:resourceId',
      {
        schema: recordingResourceSchema,
      },
      (req, res) => {
        const { recordingId, resourceId } = req.params
        respondWith(
          res,
          recordingService.readResourceAsStream(recordingId, resourceId)
        )
      }
    )

    app.put<{
      Params: z.infer<typeof recordingResourceSchema.params>
    }>(
      '/:recordingId/resources/:resourceId',
      {
        schema: recordingResourceSchema,
      },
      (req, res) => {
        const { recordingId, resourceId } = req.params
        respondWith(
          res,
          go(function* () {
            const user = yield req.getCurrentUserOrNull()
            yield ensureCanWriteRecording(user)
            return yield recordingService.writeResourceFromStream(
              recordingId,
              resourceId,
              req.raw
            )
          }),
          201
        )
      }
    )

    app.get<{
      Params: z.infer<typeof recordingIdSchema.params>
    }>(
      '/:recordingId/resource-map',
      {
        schema: recordingIdSchema,
      },
      (req, res) => {
        const { recordingId } = req.params
        respondWith(
          res,
          go(function* () {
            const user = yield req.getCurrentUserOrNull()
            yield ensureCanAccessRecording(user, recordingId)
            return yield recordingService.readResourceMap(recordingId)
          })
        )
      }
    )

    app.put<{
      Body: z.infer<typeof writeResourceMapSchema.body>
      Params: z.infer<typeof writeResourceMapSchema.params>
    }>(
      '/:recordingId/resource-map',
      {
        schema: writeResourceMapSchema,
      },
      (req, res) => {
        const { recordingId } = req.params
        respondWith(
          res,
          go(function* () {
            const user = yield req.getCurrentUserOrNull()
            yield ensureCanWriteRecording(user)

            return yield parseSchema(
              writeResourceMapSchema.body,
              req.body
            ).pipe(
              chain(body =>
                recordingService.writeResourceMap(recordingId, body)
              )
            )
          }),
          201
        )
      }
    )

    app.get<{
      Params: z.infer<typeof recordingIdSchema.params>
    }>(
      '/:recordingId/info',
      {
        schema: recordingIdSchema,
      },
      (req, res) => {
        const { recordingId } = req.params
        respondWith(
          res,
          go(function* () {
            const user = yield req.getCurrentUserOrNull()
            yield ensureCanAccessRecording(user, recordingId)
            return yield recordingService.readInfo(recordingId)
          })
        )
      }
    )

    app.post<{
      Body: z.infer<typeof createRecordingSchema.body>
    }>(
      '/',
      {
        schema: createRecordingSchema,
      },
      (req, res) => {
        const {
          title,
          url,
          description,
          mode,
          duration,
          browserName,
          browserVersion,
          operatingSystem,
        } = req.body

        respondWith(
          res,
          go(function* () {
            const user = yield req.getCurrentUserOrNull()
            yield ensureCanWriteRecording(user)

            return yield recordingService.writeInfo(
              title,
              url,
              description,
              mode,
              duration,
              browserName,
              browserVersion,
              operatingSystem
            )
          }),
          201
        )
      }
    )
  }
}
