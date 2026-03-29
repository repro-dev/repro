import { EmailMessage } from "../types";

interface EmailVerificationOptions {
  verificationUrl: string;
  userName?: string;
}

export function emailVerificationEmail(
  opts: EmailVerificationOptions,
): Pick<EmailMessage, "subject" | "html" | "text"> {
  const greeting = opts.userName ? `Hi ${opts.userName},` : "Hi,";

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="font-size: 24px; color: #111;">Verify your email address</h1>
  <p>${greeting}</p>
  <p>Thanks for signing up for Repro. Please verify your email address to get started.</p>
  <p style="margin: 32px 0;">
    <a href="${opts.verificationUrl}" style="background-color: #111; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">Verify email</a>
  </p>
  <p>If you didn't create a Repro account, you can safely ignore this email.</p>
  <p>If the button doesn't work, copy and paste this URL into your browser:</p>
  <p style="word-break: break-all; color: #666;">${opts.verificationUrl}</p>
</body>
</html>`;

  const text = `${greeting}

Thanks for signing up for Repro. Please verify your email address to get started.

Verify your email: ${opts.verificationUrl}

If you didn't create a Repro account, you can safely ignore this email.`;

  return {
    subject: "Verify your Repro email address",
    html,
    text,
  };
}
