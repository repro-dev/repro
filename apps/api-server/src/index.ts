import compress from '@fastify/compress'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import { buildRateLimitOptions } from '~/rateLimit'

import { Google } from 'arctic'
import fastify, { FastifyPluginAsync } from 'fastify'
import {
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod'
import { defaultEnv as env } from '~/config/env'
import { createSessionDecorator } from '~/decorators/session'
import { createPaddleClient } from '~/modules/billing'
import { createPostgresDatabaseClient } from '~/modules/database/database-postgres'
import { sendEmail } from '~/modules/email'
import {
  createFastifyLoggerOptions,
  registerRequestLoggingHooks,
} from '~/modules/logger'
import { createRedisClient, RedisClient } from '~/modules/redis'
import { createS3StorageClient } from '~/modules/storage-s3'
import { createAccountRouter } from '~/routers/account'
import { createAgenticRouter } from '~/routers/agentic'
import { createApiKeysRouter } from '~/routers/apiKeys'
import { createBillingRouter } from '~/routers/billing'
import { createBillingWebhookRouter } from '~/routers/billingWebhook'
import { createFeatureGateRouter } from '~/routers/featureGate'
import { createHealthRouter } from '~/routers/health'
import { createOAuthRouter } from '~/routers/oauth'
import { createProjectRouter } from '~/routers/project'
import { createSocialAuthRouter } from '~/routers/socialAuth'
import { createAccountService } from '~/services/account'
import { createApiKeyService } from '~/services/apiKeys'
import { createBillingService } from '~/services/billing'
import { createBillingWebhookService } from '~/services/billingWebhook'
import { createFeatureGateService } from '~/services/featureGate'
import { createHealthService } from '~/services/health'
import { createOAuthService } from '~/services/oauth'
import { createProjectService } from '~/services/project'
import { createRecordingService } from '~/services/recording'
import { createSocialAuthService } from '~/services/socialAuth'
import { serverError } from '~/utils/errors'
import { createHttpClient } from './modules/http'
import { createStaffRouter } from './routers/staff'
import { createStaffOAuthRouter } from './routers/staffOAuth'
import { buildHelmetOptions } from './securityHeaders'
import { createAgenticService } from './services/agentic'
import { startExpiredSessionCleanup } from './sessionCleanup'

const httpClient = createHttpClient()

const database = createPostgresDatabaseClient({
  host: env.DB_HOST,
  port: env.DB_PORT,
  database: env.DB_NAME,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  ssl: env.DB_SSL,
})

const storage = createS3StorageClient({
  endpoint: env.STORAGE_ENDPOINT,
  region: env.STORAGE_REGION,
  bucket: env.STORAGE_BUCKET,
  accessKeyId: env.STORAGE_ACCESS_KEY_ID,
  secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY,
})

// Initialize Redis client at module level when a URL is configured.
// Falls back to null when RATE_LIMIT_REDIS_URL is not set.
const redisClient: RedisClient | null = env.RATE_LIMIT_REDIS_URL
  ? createRedisClient({ url: env.RATE_LIMIT_REDIS_URL })
  : null

function createGoogleProvider(callbackPath: string) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return null
  }

  const arctic = new Google(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    `${env.REPRO_API_URL}${callbackPath}`
  )

  return {
    createAuthorizationURL: (state: string, codeVerifier: string) =>
      arctic.createAuthorizationURL(state, codeVerifier, [
        'openid',
        'email',
        'profile',
      ]),
    validateAuthorizationCode: (code: string, codeVerifier: string) =>
      arctic.validateAuthorizationCode(code, codeVerifier),
    fetchUserInfo: async (accessToken: string) => {
      const resp = await fetch(
        'https://openidconnect.googleapis.com/v1/userinfo',
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      return resp.json() as Promise<{
        sub: string
        email: string
        name: string
      }>
    },
  }
}

async function bootstrap() {
  const app = fastify({
    bodyLimit: 16777216, // 16MiB
    logger: createFastifyLoggerOptions(),
    disableRequestLogging: true,
    // Trust the portless reverse proxy so that secure:'auto' on the session
    // cookie evaluates to true (portless terminates TLS and forwards over HTTP).
    // Without this, SameSite=None cookies are sent without the Secure flag and
    // browsers reject them, breaking cross-site requests from the apiBridge iframe.
    trustProxy: true,
  })

  app.addContentTypeParser('*', async () => {})

  app.register(cors, {
    origin:
      process.env.NODE_ENV === 'production' ? 'https://app.repro.dev' : true,
    credentials: true,
  })

  app.register(compress)

  app.register(
    helmet,
    buildHelmetOptions({ isProduction: process.env.NODE_ENV === 'production' })
  )

  // Wire up the module-level Redis client for distributed rate limiting.
  // Attach the error handler here so it can reference the app logger.
  // Falls back to in-memory store when redisClient is null.
  if (redisClient) {
    redisClient.on('error', err => {
      app.log.warn({ err }, 'Redis client error')
    })
  }

  // Must await so the plugin's onRoute hook is installed before routes are added.
  // Without await, global:true doesn't apply to routes registered on this instance.
  await app.register(
    rateLimit,
    buildRateLimitOptions({
      unauthenticatedRpm: env.RATE_LIMIT_UNAUTHENTICATED_RPM,
      authenticatedRpm: env.RATE_LIMIT_AUTHENTICATED_RPM,
      uploadRpm: env.RATE_LIMIT_UPLOAD_RPM,
      ...(redisClient ? { redis: redisClient } : {}),
    })
  )

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  const billingService = createBillingService(database, env, undefined, app.log)
  const accountService = createAccountService(
    database,
    sendEmail,
    billingService,
    undefined,
    app.log
  )
  const agenticService = createAgenticService(database, httpClient)
  const oauthService = createOAuthService(database)
  const apiKeyService = createApiKeyService(database)
  const featureGateService = createFeatureGateService(database)
  const healthService = createHealthService(
    database,
    storage,
    redisClient ?? undefined
  )
  const projectService = createProjectService(database)
  const recordingService = createRecordingService(database, storage, app.log)
  const socialAuthService = createSocialAuthService(database)

  const googleProvider = createGoogleProvider('/account/oauth/google/callback')
  const socialAuthRouter = createSocialAuthRouter(
    accountService,
    socialAuthService,
    env,
    googleProvider ? { google: googleProvider } : {}
  )

  const accountRouter = createAccountRouter(accountService, sendEmail)
  const agenticRouter = createAgenticRouter(
    agenticService,
    accountService,
    undefined,
    {
      agenticRateLimitPerHour: env.AGENTIC_RATE_LIMIT_PER_HOUR,
      agenticMaxMessagesPerRecording: env.AGENTIC_MAX_MESSAGES_PER_RECORDING,
    }
  )
  const apiKeysRouter = createApiKeysRouter(apiKeyService, accountService)
  const billingRouter = createBillingRouter(billingService, accountService, env)
  const billingWebhookRouter =
    !env.BILLING_STUBBED && env.PADDLE_API_KEY && env.PADDLE_WEBHOOK_SECRET
      ? createBillingWebhookRouter(
          createBillingWebhookService(
            database,
            billingService,
            createPaddleClient({
              apiKey: env.PADDLE_API_KEY,
              environment: env.PADDLE_ENVIRONMENT,
              webhookSecret: env.PADDLE_WEBHOOK_SECRET,
            })
          )
        )
      : null
  const featureGateRouter = createFeatureGateRouter(
    featureGateService,
    accountService,
    billingService,
    env
  )
  const healthRouter = createHealthRouter(healthService)
  const oauthRouter = createOAuthRouter(oauthService, accountService)
  const projectRouter = createProjectRouter(
    projectService,
    recordingService,
    accountService
  )
  const staffRouter = createStaffRouter(accountService, projectService)

  const staffGoogleProvider = createGoogleProvider(
    '/staff/oauth/google/callback'
  )
  const staffOAuthRouter = createStaffOAuthRouter(
    accountService,
    env,
    staffGoogleProvider ? { google: staffGoogleProvider } : {}
  )

  const registerSessionDecorator = createSessionDecorator(
    accountService,
    env,
    apiKeyService
  )

  const accountPlugins: FastifyPluginAsync = async app => {
    await app.register(accountRouter)
    await app.register(socialAuthRouter)
    await app.register(apiKeysRouter)
  }

  const staffPlugins: FastifyPluginAsync = async app => {
    await app.register(staffRouter)
    await app.register(staffOAuthRouter)
  }

  const routers: Record<string, FastifyPluginAsync> = {
    '/account': accountPlugins,
    '/agentic': agenticRouter,
    '/billing': billingRouter,
    ...(billingWebhookRouter
      ? { '/billing/webhooks': billingWebhookRouter }
      : {}),
    '/feature-gates': featureGateRouter,
    '/health': healthRouter,
    '/oauth': oauthRouter,
    '/projects': projectRouter,
    '/staff': staffPlugins,
  }

  registerSessionDecorator(app)
  registerRequestLoggingHooks(app)

  for (const [path, callback] of Object.entries(routers)) {
    app.register(callback, { prefix: path })
  }

  app.setErrorHandler((err, _req, res) => {
    res.status(500).send(serverError(err.message))
  })

  app.listen(
    {
      host: env.HOST,
      port: +env.PORT,
    },
    err => {
      if (err) {
        app.log.error(err)
        process.exit(1)
      }
    }
  )

  // Periodically delete sessions past hard expiry — runs out of band so it
  // never blocks request handling.
  const cleanupInterval = startExpiredSessionCleanup(
    accountService,
    app.log,
    env.SESSION_CLEANUP_INTERVAL
  )

  app.addHook('onClose', async () => {
    clearInterval(cleanupInterval)
    if (redisClient) {
      await redisClient.quit()
    }
  })
}

bootstrap()
