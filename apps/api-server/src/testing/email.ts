import { EmailMessage, EmailProvider } from '@repro/email'
import { resolve } from 'fluture'

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

export function createCapturedSendEmail(log: Array<EmailMessage>) {
  return createCapturedEmailProvider(log).send
}

export function getCapturedEmailLog(log: Array<EmailMessage>) {
  return [...log]
}
