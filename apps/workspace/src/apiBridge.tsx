import { TrackedEvent } from '@repro/analytics'
import { createApiClient } from '@repro/api-client'
import { Fetch } from '@repro/api-client/src/types'
import { logger } from '@repro/logger'
import { createMessagingAgent } from '@repro/messaging'
import {
  FutureInstance,
  bichain,
  chainRej,
  map,
  parallel,
  reject,
  resolve,
} from 'fluture'
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

// Infer MIME type from URL extension for data URL construction
function inferMimeType(url: string): string {
  const path = url.split('?')[0] ?? ''
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  const mimeTypes: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    webp: 'image/webp',
    woff: 'font/woff',
    woff2: 'font/woff2',
    ttf: 'font/ttf',
    otf: 'font/otf',
    eot: 'application/vnd.ms-fontobject',
    css: 'text/css',
    js: 'application/javascript',
  }
  return mimeTypes[ext] ?? 'application/octet-stream'
}

function dataViewToDataURL(dv: DataView, url: string): string {
  const bytes = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!)
  }
  const base64 = btoa(binary)
  const mimeType = inferMimeType(url)
  return `data:${mimeType};base64,${base64}`
}

// Pre-fetch a list of resource URLs as data URLs. Each URL is fetched with the
// workspace origin's credentials so cross-origin resources (fonts, CDN images)
// succeed. Failures are silently dropped so the screenshot still completes.
agent.subscribeToIntent<{ urls: string[] }, Record<string, string>>(
  'resources:prefetch',
  payload => {
    const { urls } = payload

    return parallel(Infinity)(
      urls.map(url =>
        apiClient
          .fetch<DataView>(url, {}, 'binary', 'binary')
          .pipe(
            map((dv): [string, string] | null => [
              url,
              dataViewToDataURL(dv, url),
            ])
          )
          .pipe(chainRej(() => resolve(null)))
      )
    ).pipe(
      map(results => {
        const record: Record<string, string> = {}
        for (const entry of results) {
          if (entry !== null) {
            record[entry[0]] = entry[1]
          }
        }
        return record
      })
    )
  }
)
