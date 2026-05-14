import { unsign } from '@fastify/cookie'
import { FastifyInstance } from 'fastify'
import { promise } from 'fluture'
import { AccountService } from '~/services/account'
import { Harness, createTestHarness } from '~/testing'
import { createAccountRouter } from './account'

export type AccountTestContext = {
  harness: Harness
  accountService: AccountService
  app: FastifyInstance
}

export async function createAccountTestContext({
  prefix,
}: {
  prefix?: string
} = {}): Promise<AccountTestContext> {
  const harness = await createTestHarness()
  const accountService = harness.services.accountService
  const app = harness.bootstrap(async app => {
    if (prefix == null) {
      await app.register(createAccountRouter(accountService))
      return
    }

    await app.register(createAccountRouter(accountService), { prefix })
  })

  await app.ready()

  return { harness, accountService, app }
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
