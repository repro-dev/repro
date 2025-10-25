import { input, password } from '@inquirer/prompts'
import { fork } from 'fluture'

import { defaultEnv as env } from '~/config/env'
import { createPostgresDatabaseClient } from '~/modules/database/database-postgres'
import { createStubEmailUtils } from '~/modules/email-utils'
import { createAccountService } from '~/services/account'

const database = createPostgresDatabaseClient({
  host: env.DB_HOST,
  port: env.DB_PORT,
  database: env.DB_NAME,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  ssl: env.DB_SSL,
})

// FIXME: use real SMTP email utils?
const emailUtils = createStubEmailUtils([])
const accountService = createAccountService(database, emailUtils)

async function main() {
  const name = await input({ message: 'Name', required: true })

  const email = await input({ message: 'Email', required: true })

  const pw = await password({ message: 'Password', mask: true })

  await password({
    message: 'Confirm password',
    mask: true,
    validate: value => value === pw,
  })

  return accountService
    .createStaffUser(name, email, pw)
    .pipe(
      fork(error => console.error('Unable to create staff user', error))(user =>
        console.log('Staff user created:', user.id)
      )
    )
}

main()
