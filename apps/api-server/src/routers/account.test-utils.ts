import { unsign } from '@fastify/cookie'
import { FastifyInstance } from 'fastify'
import { promise } from 'fluture'
import { sendEmail as defaultSendEmail } from '~/modules/email'
import { AccountService } from '~/services/account'
import { ProjectService } from '~/services/project'
import { Harness, createTestHarness } from '~/testing'
import { createAccountRouter } from './account'

export type AccountTestContext = {
  harness: Harness
  accountService: AccountService
  projectService: ProjectService
  app: FastifyInstance
}

export async function createAccountTestContext({
  prefix,
  sendEmail,
}: {
  prefix?: string
  sendEmail?: typeof defaultSendEmail
} = {}): Promise<AccountTestContext> {
  const harness = await createTestHarness({ sendEmail })
  const accountService = harness.services.accountService
  const projectService = harness.services.projectService
  const app = harness.bootstrap(async app => {
    if (prefix == null) {
      await app.register(
        createAccountRouter(accountService, harness.emailModule)
      )
      return
    }

    await app.register(
      createAccountRouter(accountService, harness.emailModule),
      {
        prefix,
      }
    )
  })

  await app.ready()

  return { harness, accountService, projectService, app }
}

export function getSessionTokenFromResponse(
  res: { cookies: Array<{ name: string; value: string }> },
  sessionCookieName: string,
  sessionSecret: string
) {
  const cookie = res.cookies.find(c => c.name === sessionCookieName)
  const rawToken = unsign(cookie?.value ?? '', sessionSecret).value

  if (rawToken == null) {
    throw new Error('Expected a signed session cookie to be present')
  }

  return rawToken
}

export async function createUserWithCredentials(
  accountService: AccountService,
  email: string,
  password: string
) {
  const account = await promise(accountService.createAccount('Lockout Test'))

  return promise(
    accountService.createUser(account.id, 'Test User', email, password)
  )
}

export async function attemptLogin(
  app: FastifyInstance,
  email: string,
  password: string
) {
  return app.inject({
    method: 'POST',
    url: '/login',
    body: { email, password },
  })
}
