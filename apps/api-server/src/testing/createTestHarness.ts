import { randomString } from '@repro/random-string'
import { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { sql } from 'kysely'
import { Env, createEnv } from '~/config/createEnv'
import { createSessionDecorator } from '~/decorators/session'
import { Database } from '~/modules/database'
import { SendParams, createStubEmailUtils } from '~/modules/email-utils'
import { Storage } from '~/modules/storage'
import { createAccountService } from '~/services/account'
import { createFeatureGateService } from '~/services/featureGate'
import { createProjectService } from '~/services/project'
import { createRecordingService } from '~/services/recording'
import { setUpTestDatabase } from './database'
import { loadFixtures } from './loadFixtures'
import { setUpTestFileSystemStorage } from './storage'
import { Fixture, FixtureArrayToValues, Services } from './types'
import { fromRouter } from './utils'

export interface Harness {
  db: Database
  storage: Storage
  env: Env
  services: Services

  bootstrap(router: FastifyPluginAsync): FastifyInstance
  generateRandomEmailAddress(): string
  // expectEmailToHaveBeenSent(params: SendParams): void
  loadFixtures<T extends Array<Fixture<unknown>>>(
    fixtures: [...T]
  ): Promise<FixtureArrayToValues<T>>

  reset(): Promise<void>
  close(): Promise<void>
}

export async function createTestHarness(): Promise<Harness> {
  const env = createEnv()

  const { db, close: closeDb } = await setUpTestDatabase()
  const { storage, close: closeStorage } = await setUpTestFileSystemStorage()

  const emailLog: Array<SendParams> = []
  const emailUtils = createStubEmailUtils(emailLog)

  function generateRandomEmailAddress() {
    return randomString(10).toLowerCase() + '@repro.test'
  }

  const accountService = createAccountService(db, emailUtils)
  const featureGateService = createFeatureGateService(db)
  const projectService = createProjectService(db)
  const recordingService = createRecordingService(db, storage)

  const services = {
    accountService,
    featureGateService,
    projectService,
    recordingService,
  }

  const sessionDecorator = createSessionDecorator(accountService, env)

  function bootstrap(router: FastifyPluginAsync) {
    return fromRouter(router, [sessionDecorator])
  }

  const curriedLoadFixtures = loadFixtures.bind(
    loadFixtures,
    services
  ) as unknown as <T extends Array<Fixture<unknown>>>(
    fixtures: [...T]
  ) => Promise<FixtureArrayToValues<T>>

  // function expectEmailToHaveBeenSent(expected: Partial<SendParams>) {
  //   return
  // }

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
  }

  async function close() {
    await closeDb()
    await closeStorage()
  }

  return {
    env,
    db,
    services,
    storage,

    bootstrap,
    // expectEmailToHaveBeenSent,
    generateRandomEmailAddress,
    loadFixtures: curriedLoadFixtures,

    reset,
    close,
  }
}
