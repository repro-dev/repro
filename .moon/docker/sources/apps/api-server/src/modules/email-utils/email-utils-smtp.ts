import { FutureInstance, attemptP, chain, node } from 'fluture'
import nodemailer from 'nodemailer'
import SMTPTransport from 'nodemailer/lib/smtp-transport'
import nunjucks from 'nunjucks'
import { EmailUtils, SendParams } from './types'

interface Config {
  smtpOptions: SMTPTransport.Options
  addresses: Record<string, string>
}

export function createSMTPEmailUtils(config: Config): EmailUtils {
  const transport = nodemailer.createTransport(config.smtpOptions)

  function send(params: SendParams): FutureInstance<Error, void> {
    const body = node<Error, string>(done =>
      nunjucks.render(
        `templates/${params.template}.html`,
        params.params,
        (err, value) => done(err, value ?? undefined)
      )
    )

    return body.pipe(
      chain(body => {
        return attemptP<Error, void>(async () => {
          await transport.sendMail({
            from: params.from,
            to: params.to,
            subject: params.subject,
            html: body,
          })
        })
      })
    )
  }

  function getAddress(key: string) {
    const address = config.addresses[key]

    if (address == null) {
      throw new Error()
    }

    return address
  }

  return {
    send,
    getAddress,
  }
}
