import compress from '@fastify/compress'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'

import fastify, { FastifyPluginAsync } from 'fastify'
import {
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod'
import { defaultEnv as env } from '~/config/env'
import { createSessionDecorator } from '~/decorators/session'
import { createPostgresDatabaseClient } from '~/modules/database/database-postgres'
import { createSMTPEmailUtils } from '~/modules/email-utils'
import { createS3StorageClient } from '~/modules/storage-s3'
import { createAccountRouter } from '~/routers/account'
import { createAgenticRouter } from '~/routers/agentic'
import { createBillingRouter } from '~/routers/billing'
import { createBillingWebhookRouter } from '~/routers/billingWebhook'
import { createFeatureGateRouter } from '~/routers/featureGate'
import { createHealthRouter } from '~/routers/health'
import { createOAuthRouter } from '~/routers/oauth'
import { createProjectRouter } from '~/routers/project'
import { createAccountService } from '~/services/account'
import { createBillingService } from '~/services/billing'
import { createBillingWebhookService } from '~/services/billingWebhook'
import { createFeatureGateService } from '~/services/featureGate'
import { createHealthService } from '~/services/health'
import { createOAuthService } from '~/services/oauth'
import { createProjectService } from '~/services/project'
import { createRecordingService } from '~/services/recording'
import { serverError } from '~/utils/errors'
import { createPaddleClient } from '~/modules/billing'
import { createHttpClient } from './modules/http'
import { createStaffRouter } from './routers/staff'
import { createAgenticService } from './services/agentic'

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

const emailUtils = createSMTPEmailUtils({
  smtpOptions: {
    host: env.EMAIL_SMTP_HOST,
    port: env.EMAIL_SMTP_PORT,
    secure: env.EMAIL_SMTP_SECURE,
    auth: {
      user: env.EMAIL_SMTP_USER,
      pass: env.EMAIL_SMTP_PASS,
    },
  },
  addresses: {
    'no-reply': 'no-reply@repro.dev',
  },
})

const accountService = createAccountService(database, emailUtils)
const agenticService = createAgenticService(database, httpClient)
const billingService = createBillingService(database, env)
const oauthService = createOAuthService(database)
const featureGateService = createFeatureGateService(database)
const healthService = createHealthService(database, storage)
const projectService = createProjectService(database)
const recordingService = createRecordingService(database, storage)

const accountRouter = createAccountRouter(accountService)
const agenticRouter = createAgenticRouter(agenticService, accountService)
const billingRouter = createBillingRouter(billingService, accountService)
const billingWebhookRouter =  !env.BILLING_STUBBED && env.PADDLE_API_KEY && env.PADDLE_WEBHOOK_SECRET
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
  accountService
)
const healthRouter = createHealthRouter(healthService)
const oauthRouter = createOAuthRouter(oauthService, accountService)
const projectRouter = createProjectRouter(
  projectService,
  recordingService,
  accountService
)
const staffRouter = createStaffRouter(accountService)

const registerSessionDecorator = createSessionDecorator(accountService, env)

function bootstrap(routers: Record<string, FastifyPluginAsync>) {
  const app = fastify({
    bodyLimit: 16777216, // 16MiB
    logger: true,
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

  app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  })

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  registerSessionDecorator(app)

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
}

bootstrap({
  '/account': accountRouter,
  '/agentic': agenticRouter,
  '/billing': billingRouter,
  ...(billingWebhookRouter
    ? { '/billing/webhooks': billingWebhookRouter }
    : {}),
  '/feature-gates': featureGateRouter,
  '/health': healthRouter,
  '/oauth': oauthRouter,
  '/projects': projectRouter,
  '/staff': staffRouter,
})
