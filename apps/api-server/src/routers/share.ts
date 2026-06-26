import { RecordingInfo } from '@repro/domain'
import { FastifyPluginAsync } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { go } from 'fluture'
import z from 'zod'
import { defaultSystemConfig } from '~/config/system'
import { RecordingService } from '~/services/recording'
import { ShareService } from '~/services/share'
import { notFound } from '~/utils/errors'
import { createResponseUtils } from '~/utils/response'

export function createShareRouter(
  shareService: ShareService,
  recordingService: RecordingService,
  config = defaultSystemConfig
): FastifyPluginAsync {
  const { respondWith } = createResponseUtils(config)

  return async function (fastify) {
    const app = fastify.withTypeProvider<ZodTypeProvider>()

    const resolveShareSchema = {
      params: z.object({
        token: z.string(),
      }),
    } as const

    // Note: This public endpoint has no rate limiting, which is acceptable
    // for the v1 speedrun. Rate limiting should be added in a follow-up
    // using the same pattern as uploadRateLimitOptions in project.ts.

    app.get<{
      Params: z.infer<typeof resolveShareSchema.params>
    }>(
      '/:token',

      {
        schema: resolveShareSchema,
      },

      (req, res) => {
        const { token } = req.params

        respondWith(
          res,
          go(function* () {
            const shareToken = yield shareService.resolveShareToken(token)

            if (shareToken.resourceType !== 'recording') {
              throw notFound('Unsupported share resource type')
            }

            const recording: RecordingInfo = yield recordingService.readInfo(
              shareToken.resourceId
            )

            return { token: shareToken, recording }
          })
        )
      }
    )
  }
}
