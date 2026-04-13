import { Account, User } from '@repro/domain'
import { FastifyRequest } from 'fastify'
import { FutureInstance, go } from 'fluture'
import { AccountService } from '~/services/account'

// Shared helper used by routers and middleware that need the current
// authenticated user plus their associated account in one Future.
export function getCurrentUserAccount(
  req: FastifyRequest,
  accountService: AccountService
): FutureInstance<Error, { user: User; account: Account }> {
  return go(function* () {
    const currentUser = yield req.getCurrentUser()
    const user = yield accountService.ensureUser(currentUser)
    const account = yield accountService.getAccountForUser(user.id)

    return { user, account }
  })
}
