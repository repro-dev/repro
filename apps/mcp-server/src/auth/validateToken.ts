import { FutureInstance, attemptP } from 'fluture'
import { Database } from '~/modules/database'

export interface AuthContext {
  userId: number
  token: string
}

export function createTokenValidator(db: Database) {
  return function validateToken(
    token: string
  ): FutureInstance<Error, AuthContext> {
    return attemptP(async () => {
      const key = await db
        .selectFrom('api_keys')
        .select(['userId', 'token'])
        .where('token', '=', token)
        .where('revokedAt', 'is', null)
        .executeTakeFirst()

      if (!key) {
        throw new Error('Invalid or revoked API key')
      }

      return { userId: key.userId, token: key.token }
    })
  }
}
