import compress from '@fastify/compress'
import cors from '@fastify/cors'

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
import { createHealthRouter } from '~/routers/health'
import { createProjectRouter } from '~/routers/project'
import { createAccountService } from '~/services/account'
import { createHealthService } from '~/services/health'
import { createProjectService } from '~/services/project'
import { createRecordingService } from '~/services/recording'
import { serverError } from '~/utils/errors'
import { createStaffRouter } from './routers/staff'

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
const healthService = createHealthService(database, storage)
const projectService = createProjectService(database)
const recordingService = createRecordingService(database, storage)

const accountRouter = createAccountRouter(accountService)
const healthRouter = createHealthRouter(healthService)
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
  })

  app.addContentTypeParser('*', async () => {})

  app.register(cors, {
    origin:
      process.env.NODE_ENV === 'production' ? 'https://app.repro.dev' : true,
    credentials: true,
  })

  app.register(compress)

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
  '/health': healthRouter,
  '/projects': projectRouter,
  '/staff': staffRouter,
})
