import { FutureInstance } from "fluture";

export interface EmailMessage {
  to: string;
  from: string;
  subject: string;
  html: string;
  text?: string;
}

export interface EmailProvider {
  send(message: EmailMessage): FutureInstance<Error, void>;
}
