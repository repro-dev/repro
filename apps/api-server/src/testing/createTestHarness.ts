import { EmailMessage } from '@repro/email'
import { randomString } from '@repro/random-string'
import { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { resolve } from 'fluture'
import { sql } from 'kysely'
import { Env, Replacer, createEnv } from '~/config/createEnv'
import { createSessionDecorator } from '~/decorators/session'
import { createStubPaddleClient } from '~/modules/billing'
import type { UpdateSubscriptionParams } from '~/modules/billing/stubPaddleClient'
import { Database } from '~/modules/database'
import {
  EmailModule,
  createEmailModule,
  sendEmail as defaultSendEmail,
} from '~/modules/email'
import { ApiLogger } from '~/modules/logger'
import { Storage } from '~/modules/storage'
import { createAccountService } from '~/services/account'
import { createBillingService } from '~/services/billing'
import { createFeatureGateService } from '~/services/featureGate'
import { createOAuthService } from '~/services/oauth'
import { createPmIntegrationService } from '~/services/pmIntegrations'
import { createProjectService } from '~/services/project'
import { createRecordingService } from '~/services/recording'
import { createSocialAuthService } from '~/services/socialAuth'
import { setUpTestDatabase } from './database'
import { loadFixtures } from './loadFixtures'
import { setUpTestFileSystemStorage } from './storage'
import { Fixture, FixtureArrayToValues, Services } from './types'
import { fromRouter } from './utils'

export interface Harness {
  db: Database
  storage: Storage
  env: Env & Replacer
  sendEmail: typeof defaultSendEmail
  emailModule: EmailModule
  services: Services
  getLastUpdateSubscriptionParams(): UpdateSubscriptionParams | null
  getSentEmails(): Array<EmailMessage>

  bootstrap(
    router: FastifyPluginAsync,
    options?: { prefix?: string }
  ): FastifyInstance
  generateRandomEmailAddress(): string
  loadFixtures<T extends Array<Fixture<unknown>>>(
    fixtures: [...T]
  ): Promise<FixtureArrayToValues<T>>

  reset(): Promise<void>
  close(): Promise<void>
}

export async function createTestHarness(
  options: {
    sendEmail?: typeof defaultSendEmail
    logger?: ApiLogger
  } = {}
): Promise<Harness> {
  const env = createEnv()

  const { db, close: closeDb } = await setUpTestDatabase()
  const { storage, close: closeStorage } = await setUpTestFileSystemStorage()

  const emailLog: Array<EmailMessage> = []
  const sendEmail = (message: EmailMessage) => {
    emailLog.push(message)
    return options.sendEmail ? options.sendEmail(message) : resolve(undefined)
  }
  const emailModule = createEmailModule({
    sendEmail,
    logger: options.logger,
  })

  function generateRandomEmailAddress() {
    return randomString(10).toLowerCase() + '@repro.test'
  }

  const stubPaddleClient = createStubPaddleClient(db)
  const billingService = createBillingService(db, env, stubPaddleClient)
  const accountService = createAccountService(db, emailModule, billingService)
  const featureGateService = createFeatureGateService(db)
  const oauthService = createOAuthService(db)
  const projectService = createProjectService(db)
  const recordingService = createRecordingService(db, storage)
  const socialAuthService = createSocialAuthService(db)
  const pmIntegrationService = createPmIntegrationService(db)

  const services = {
    accountService,
    billingService,
    featureGateService,
    oauthService,
    projectService,
    recordingService,
    socialAuthService,
    pmIntegrationService,
  }

  const sessionDecorator = createSessionDecorator(accountService, env)

  function bootstrap(
    router: FastifyPluginAsync,
    options?: { prefix?: string }
  ) {
    return fromRouter(router, [sessionDecorator], options)
  }

  const curriedLoadFixtures = loadFixtures.bind(
    loadFixtures,
    services
  ) as unknown as <T extends Array<Fixture<unknown>>>(
    fixtures: [...T]
  ) => Promise<FixtureArrayToValues<T>>

  function getSentEmails() {
    return [...emailLog]
  }

  async function reset() {
    // Truncate all tables in the current schema
    await sql`
      DO $$ DECLARE
        r RECORD;
      BEGIN
        FOR r IN (SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema()) LOOP
          EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.table_name) || ' CASCADE';
        END LOOP;
      END $$;
    `.execute(db)

    emailLog.length = 0
    stubPaddleClient.clearLastUpdateSubscriptionParams()
  }

  async function close() {
    await closeDb()
    await closeStorage()
  }

  return {
    env,
    db,
    sendEmail,
    emailModule,
    services,
    storage,

    bootstrap,
    generateRandomEmailAddress,
    getLastUpdateSubscriptionParams:
      stubPaddleClient.getLastUpdateSubscriptionParams,
    getSentEmails,
    loadFixtures: curriedLoadFixtures,

    reset,
    close,
  }
}
