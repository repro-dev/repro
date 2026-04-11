import { fork } from 'fluture'
import type { AccountService } from '~/services/account'

type SessionCleanupService = {
  deleteExpiredSessions: AccountService['deleteExpiredSessions']
}

type SessionCleanupLogger = {
  error(payload: { err: Error }, message: string): void
}

export function createExpiredSessionCleanupRunner(
  accountService: SessionCleanupService,
  logger: SessionCleanupLogger
): () => void {
  let cleanupInFlight = false

  return () => {
    if (cleanupInFlight) {
      return
    }

    cleanupInFlight = true

    accountService.deleteExpiredSessions().pipe(
      fork((error: Error) => {
        cleanupInFlight = false
        logger.error({ err: error }, 'Expired session cleanup failed')
      })(() => {
        cleanupInFlight = false
      })
    )
  }
}

export function startExpiredSessionCleanup(
  accountService: SessionCleanupService,
  logger: SessionCleanupLogger,
  cleanupIntervalSeconds: number
): NodeJS.Timeout {
  const runCleanup = createExpiredSessionCleanupRunner(accountService, logger)

  return setInterval(runCleanup, cleanupIntervalSeconds * 1000)
}
