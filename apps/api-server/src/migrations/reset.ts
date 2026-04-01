import { sql } from 'kysely'
import { defaultEnv as env } from '~/config/env'
import { createPostgresDatabaseClient } from '~/modules/database/database-postgres'
import { createS3StorageClient } from '~/modules/storage-s3'
import { migrate } from './migrate'
import { seed } from './seed'

async function main() {
  const db = createPostgresDatabaseClient({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    ssl: env.DB_SSL,
  })

  const storage = createS3StorageClient({
    endpoint: env.STORAGE_ENDPOINT,
    region: env.STORAGE_REGION,
    bucket: env.STORAGE_BUCKET,
    accessKeyId: env.STORAGE_ACCESS_KEY_ID,
    secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY,
  })

  try {
    console.log('Dropping all tables and types...')

    await db.executeQuery(
      sql
        .raw(
          `DO $$ DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = current_schema()) LOOP
    EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.tablename) || ' CASCADE';
  END LOOP;
  FOR r IN (SELECT typname FROM pg_type JOIN pg_namespace ON pg_type.typnamespace = pg_namespace.oid WHERE pg_namespace.nspname = current_schema() AND pg_type.typtype = 'e') LOOP
    EXECUTE 'DROP TYPE IF EXISTS ' || quote_ident(r.typname) || ' CASCADE';
  END LOOP;
END $$`
        )
        .compile(db)
    )

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

    console.log('Migrations complete. Running seed...')
    await seed(db, storage)
    console.log('Reset complete.')
  } finally {
    await db.destroy()
  }
}

main()
