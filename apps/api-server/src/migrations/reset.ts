import { sql } from 'kysely'
import { defaultEnv as env } from '~/config/env'
import { createPostgresDatabaseClient } from '~/modules/database/database-postgres'
import { migrate } from './migrate'
import { seed } from './seed'
import { seedFixtures } from './seed-fixtures'

async function main() {
  const db = createPostgresDatabaseClient({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    ssl: env.DB_SSL,
  })

  console.log('Dropping all tables...')

  await db.executeQuery(
    sql
      .raw(
        `DO $$ DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = current_schema()) LOOP
    EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.tablename) || ' CASCADE';
  END LOOP;
END $$`
      )
      .compile(db)
  )

  console.log('All tables dropped. Running migrations...')

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

  console.log('Running seed...')
  await seed(db)
  console.log('Seed complete.')

  await seedFixtures(db)
}

main()
