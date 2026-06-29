import { EmailMessage } from '@repro/email'
import { fork } from 'fluture'
import { OutboxJson } from '~/modules/database'
import { ApiLogger } from '~/modules/logger'
import { EMAIL_SEND_JOB_TYPE } from '~/workers/outboxRegistry'
import { type OutboxService } from './outbox'

export type TransactionalEmailEnqueueOptions = {
  emailKind: string
  idempotencyKey?: string
  context?: Record<string, unknown>
}

export type TransactionalEmailService = {
  enqueue: (
    message: EmailMessage,
    options: TransactionalEmailEnqueueOptions
  ) => void
}

export type CreateTransactionalEmailServiceParams = {
  outboxService: OutboxService
  logger?: ApiLogger
}

export function createTransactionalEmailService({
  outboxService,
  logger,
}: CreateTransactionalEmailServiceParams): TransactionalEmailService {
  function enqueue(
    message: EmailMessage,
    options: TransactionalEmailEnqueueOptions
  ): void {
    const enqueueParams: Parameters<OutboxService['enqueue']>[0] = {
      type: EMAIL_SEND_JOB_TYPE,
      payload: {
        message: message as unknown as OutboxJson,
        emailKind: options.emailKind,
      },
    }
    if (options.idempotencyKey !== undefined) {
      enqueueParams.idempotencyKey = options.idempotencyKey
    }

    outboxService.enqueue(enqueueParams).pipe(
      fork((error: Error) => {
        logger?.error(
          {
            err: error,
            event: 'transactional_email.enqueue_failed',
            emailKind: options.emailKind,
            ...options.context,
          },
          'Transactional email enqueue failed'
        )
      })(() => {})
    )
  }

  return { enqueue }
}
