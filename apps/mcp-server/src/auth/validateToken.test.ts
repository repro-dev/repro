import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { fork } from 'fluture'
import { Database } from '~/modules/database'
import { createTokenValidator } from './validateToken'

function forkToPromise<T>(
  future: ReturnType<ReturnType<typeof createTokenValidator>>
): Promise<T> {
  return new Promise((resolveP, rejectP) => {
    fork((err: Error) => rejectP(err))((value: T) => resolveP(value))(
      future as never
    )
  })
}

function makeMockDb(
  result: { userId: number; token: string } | undefined
): Database {
  const builder = {
    select: () => builder,
    where: () => builder,
    executeTakeFirst: async () => result,
  }
  return {
    selectFrom: () => builder,
  } as unknown as Database
}

describe('validateToken', () => {
  it('returns AuthContext for a valid token', async () => {
    const db = makeMockDb({ userId: 42, token: 'valid-token' })
    const validateToken = createTokenValidator(db)
    const result = await forkToPromise<{ userId: number; token: string }>(
      validateToken('valid-token')
    )
    assert.equal(result.userId, 42)
    assert.equal(result.token, 'valid-token')
  })

  it('rejects with error when token is not found', async () => {
    const db = makeMockDb(undefined)
    const validateToken = createTokenValidator(db)
    await assert.rejects(
      () => forkToPromise(validateToken('unknown-token')),
      (err: Error) => {
        assert.equal(err.message, 'Invalid or revoked API key')
        return true
      }
    )
  })

  it('rejects with error when token is revoked', async () => {
    const db = makeMockDb(undefined)
    const validateToken = createTokenValidator(db)
    await assert.rejects(
      () => forkToPromise(validateToken('revoked-token')),
      (err: Error) => {
        assert.equal(err.message, 'Invalid or revoked API key')
        return true
      }
    )
  })
})
