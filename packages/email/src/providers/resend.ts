import { FutureInstance, attemptP, chain, reject, resolve } from "fluture";
import { Resend } from "resend";
import { EmailMessage, EmailProvider } from "../types";

export function createResendProvider(client: Resend): EmailProvider {
  function send(message: EmailMessage): FutureInstance<Error, void> {
    return (
      attemptP(() =>
        client.emails.send({
          to: message.to,
          from: message.from,
          subject: message.subject,
          html: message.html,
          text: message.text,
        }),
      ) as FutureInstance<Error, Awaited<ReturnType<typeof client.emails.send>>>
    ).pipe(
      chain((result) => {
        if (result.error) {
          return reject(new Error(result.error.message));
        }
        return resolve(undefined);
      }),
    );
  }

  return { send };
}
