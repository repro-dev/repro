import { defaultEnv as env } from '~/config/env'
import { createPostgresDatabaseClient } from '~/modules/database/database-postgres'
import { migrate } from './migrate'

async function main() {
  const db = createPostgresDatabaseClient({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    ssl: env.DB_SSL,
  })

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
}

main()
