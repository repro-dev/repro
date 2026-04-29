import expect from 'expect'
import { after, before, beforeEach, describe, it } from 'node:test'
import {
  AccountTestContext,
  attemptLogin,
  createAccountTestContext,
  createUserWithCredentials,
} from './account.test-utils'

describe('Routers > Account > Lockout', () => {
  let context: AccountTestContext

  before(async () => {
    context = await createAccountTestContext()
  })

  beforeEach(async () => {
    await context.harness.reset()
  })

  after(async () => {
    await context.harness.close()
  })

  it('should allow login attempts below the lockout threshold', async () => {
    const email = context.harness.generateRandomEmailAddress()
    await createUserWithCredentials(context.accountService, email, 'hunter2!')

    for (let i = 0; i < 4; i++) {
      const res = await attemptLogin(context.app, email, 'wrong-password')
      expect(res.statusCode).toEqual(401)
    }

    const res = await attemptLogin(context.app, email, 'hunter2!')
    expect(res.statusCode).toEqual(200)
  })

  it('should return 429 after 5 consecutive failed login attempts', async () => {
    const email = context.harness.generateRandomEmailAddress()
    await createUserWithCredentials(context.accountService, email, 'hunter2!')

    for (let i = 0; i < 5; i++) {
      await attemptLogin(context.app, email, 'wrong-password')
    }

    const res = await attemptLogin(context.app, email, 'wrong-password')
    expect(res.statusCode).toEqual(429)
  })

  it('should return 429 even with correct credentials when account is locked', async () => {
    const email = context.harness.generateRandomEmailAddress()
    await createUserWithCredentials(context.accountService, email, 'hunter2!')

    for (let i = 0; i < 5; i++) {
      await attemptLogin(context.app, email, 'wrong-password')
    }

    const res = await attemptLogin(context.app, email, 'hunter2!')
    expect(res.statusCode).toEqual(429)
  })

  it('should reset lockout counter after a successful login', async () => {
    const email = context.harness.generateRandomEmailAddress()
    await createUserWithCredentials(context.accountService, email, 'hunter2!')

    for (let i = 0; i < 4; i++) {
      await attemptLogin(context.app, email, 'wrong-password')
    }

    const successRes = await attemptLogin(context.app, email, 'hunter2!')
    expect(successRes.statusCode).toEqual(200)

    for (let i = 0; i < 4; i++) {
      const res = await attemptLogin(context.app, email, 'wrong-password')
      expect(res.statusCode).toEqual(401)
    }

    const finalRes = await attemptLogin(context.app, email, 'hunter2!')
    expect(finalRes.statusCode).toEqual(200)
  })
})
