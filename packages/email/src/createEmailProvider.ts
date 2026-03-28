import { Resend } from "resend";
import { createConsoleProvider } from "./providers/console";
import { createResendProvider } from "./providers/resend";
import { EmailProvider } from "./types";

export function createEmailProvider(apiKey: string | undefined): EmailProvider {
  if (!apiKey) {
    return createConsoleProvider();
  }

  return createResendProvider(new Resend(apiKey));
}
