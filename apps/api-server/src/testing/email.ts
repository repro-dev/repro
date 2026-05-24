import { EmailMessage, EmailProvider } from '@repro/email'
import { resolve } from 'fluture'
import {
  TransactionalEmailService,
  createTransactionalEmailService,
} from '~/modules/email'

export function createCapturedEmailProvider(
  log: Array<EmailMessage>
): EmailProvider {
  return {
    send(message: EmailMessage) {
      log.push(message)
      return resolve(undefined)
    },
  }
}

export function createCapturedTransactionalEmailService(
  log: Array<EmailMessage>,
  baseUrl: string,
  fromAddress: string
): TransactionalEmailService {
  return createTransactionalEmailService(
    createCapturedEmailProvider(log),
    baseUrl,
    fromAddress
  )
}
