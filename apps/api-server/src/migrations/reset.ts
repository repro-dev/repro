import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3'
import { sql } from 'kysely'
import { fileURLToPath } from 'node:url'
import { defaultEnv as env } from '~/config/env'
import { createPostgresDatabaseClient } from '~/modules/database/database-postgres'
import { migrate } from './migrate'

export async function dropSchemaObjects(
  db: ReturnType<typeof createPostgresDatabaseClient>
) {
  await db.executeQuery(
    sql
      .raw(
        `DO $$ DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = current_schema()) LOOP
    EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.tablename) || ' CASCADE';
  END LOOP;
  FOR r IN (
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = current_schema()
  ) LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %I.%I(%s) CASCADE', current_schema(), r.proname, r.args);
  END LOOP;
  FOR r IN (SELECT typname FROM pg_type JOIN pg_namespace ON pg_type.typnamespace = pg_namespace.oid WHERE pg_namespace.nspname = current_schema() AND pg_type.typtype = 'e') LOOP
    EXECUTE 'DROP TYPE IF EXISTS ' || quote_ident(r.typname) || ' CASCADE';
  END LOOP;
END $$`
      )
      .compile(db)
  )
}

async function clearStorageBucket(keyPrefix: string) {
  const s3 = new S3Client({
    endpoint: env.STORAGE_ENDPOINT,
    forcePathStyle: true,
    region: env.STORAGE_REGION,
    credentials: {
      accessKeyId: env.STORAGE_ACCESS_KEY_ID,
      secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY,
    },
  })

  let continuationToken: string | undefined

  do {
    const command: {
      Bucket: string
      ContinuationToken?: string
      Prefix?: string
    } = {
      Bucket: env.STORAGE_BUCKET,
      ContinuationToken: continuationToken,
    }

    // When keyPrefix is non-empty, scope deletion to objects within that
    // prefix namespace. Empty prefix = clear everything (main checkout).
    if (keyPrefix) {
      command.Prefix = keyPrefix
    }

    const response = await s3.send(new ListObjectsV2Command(command))

    const keys = (response.Contents ?? [])
      .map(item => item.Key)
      .filter((key): key is string => key != null)

    if (keys.length) {
      await s3.send(
        new DeleteObjectsCommand({
          Bucket: env.STORAGE_BUCKET,
          Delete: {
            Objects: keys.map(Key => ({ Key })),
            Quiet: true,
          },
        })
      )
    }

    continuationToken = response.IsTruncated
      ? response.NextContinuationToken
      : undefined
  } while (continuationToken)
}

async function main() {
  const db = createPostgresDatabaseClient({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    ssl: env.DB_SSL,
  })

  try {
    console.log('Dropping all tables and types...')

    await dropSchemaObjects(db)

    console.log('Clearing storage bucket...')
    await clearStorageBucket(env.STORAGE_KEY_PREFIX)

    console.log('All tables and types dropped. Running migrations...')

    const { error, results } = await migrate(db)

    if (results) {
      for (const result of results) {
        console.log(`Migration ${result.migrationName} was ${result.status}`)
      }
    }

    if (error) {
      console.error(error)
      process.exit(1)
    }

    console.log('Reset complete. Run seed to repopulate data.')
  } finally {
    await db.destroy()
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
}
