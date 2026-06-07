import { TrackedEvent } from '@repro/analytics'
import { createApiClient } from '@repro/api-client'
import { Fetch } from '@repro/api-client/src/types'
import { RecordingMode, SourceEventView } from '@repro/domain'
import { logger } from '@repro/logger'
import { createMessagingAgent } from '@repro/messaging'
import { createUploadWorker } from '@repro/recording-api'
import { fromByteString } from '@repro/wire-formats'
import { FutureInstance, attempt, bichain, map, reject, resolve } from 'fluture'
import { serializeError } from 'serialize-error'
import z from 'zod'
import { defaultEnv as env } from '~/config/env'

const apiClient = createApiClient({
  baseUrl: env.REPRO_API_URL ?? '',
  authStorage: 'memory',
})

const agent = createMessagingAgent({
  name: 'apiBridge',
})

// Map of in-flight request IDs to their AbortControllers. Allows abort signals
// originating in the page context to be forwarded across the postMessage boundary.
const abortControllers = new Map<string, AbortController>()

agent.subscribeToIntent<
  { requestId: string; args: Parameters<Fetch> },
  unknown
>('api-client:fetch', payload => {
  const { requestId, args } = payload
  const [url, options, requestType, responseType] = args
  const controller = new AbortController()
  abortControllers.set(requestId, controller)

  // Merge the locally-created signal into the fetch options
  const argsWithSignal: Parameters<Fetch> = [
    url,
    { ...options, signal: controller.signal },
    requestType,
    responseType,
  ]

  // Clean up the abort controller map regardless of success or failure
  const cleanup = () => {
    abortControllers.delete(requestId)
  }

  const result: FutureInstance<Error, unknown> = apiClient.fetch(
    ...argsWithSignal
  )

  return result.pipe(
    bichain<Error, Error, unknown>(err => {
      cleanup()
      return reject(err)
    })(val => {
      cleanup()
      return resolve(val)
    })
  )
})

agent.subscribeToIntent<{ requestId: string }, void>(
  'api-client:abort',
  payload => {
    const controller = abortControllers.get(payload.requestId)
    if (controller) {
      controller.abort()
    }
    return resolve(undefined)
  }
)

agent.subscribeToIntent<TrackedEvent, void>('analytics:track', payload => {
  // TODO: Track analytics events via API
  // 0. Create API endpoint for tracking
  // 1. Batch analytics events
  // 2. Send to backend

  if (env.BUILD_ENV === 'development') {
    logger.debug('analytics:track', payload)
  }

  return resolve(undefined)
})

const uploadWorker = createUploadWorker(apiClient, {
  withEncryptionScheme: 'none',
})

const UploadEnqueuePayloadSchema = z.object({
  projectId: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  url: z.string(),
  mode: z.nativeEnum(RecordingMode),
  duration: z.number(),
  events: z.array(z.string()),
  browserName: z.string().nullable(),
  browserVersion: z.string().nullable(),
  operatingSystem: z.string().nullable(),
})

type UploadEnqueuePayload = z.infer<typeof UploadEnqueuePayloadSchema>

agent.subscribeToIntent<UploadEnqueuePayload, string>(
  'upload:enqueue',
  payload => {
    console.log('[apiBridge] upload:enqueue received', {
      projectId: payload.projectId,
      title: payload.title,
      eventsCount: payload.events?.length,
    })
    return attempt<Error, UploadEnqueuePayload>(() =>
      UploadEnqueuePayloadSchema.parse(payload)
    )
      .pipe(
        bichain<Error, Error, UploadEnqueuePayload>((err: Error) => {
          console.error(
            '[apiBridge] upload:enqueue validation failed',
            serializeError(err)
          )
          return reject(err)
        })(resolved => resolve(resolved))
      )
      .pipe(
        map(input =>
          uploadWorker.enqueue({
            ...input,
            description: input.description ?? '',
            events: input.events.map(data =>
              SourceEventView.over(new DataView(fromByteString(data).buffer))
            ),
          })
        )
      )
  }
)

const UploadProgressPayloadSchema = z.object({
  ref: z.string(),
})

type UploadProgressPayload = z.infer<typeof UploadProgressPayloadSchema>

agent.subscribeToIntent<
  UploadProgressPayload,
  ReturnType<typeof uploadWorker.getProgress>
>('upload:progress', payload => {
  return attempt<Error, UploadProgressPayload>(() =>
    UploadProgressPayloadSchema.parse(payload)
  ).pipe(map(({ ref }) => uploadWorker.getProgress(ref)))
})
