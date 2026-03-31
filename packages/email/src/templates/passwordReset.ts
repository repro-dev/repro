import { EmailMessage } from "../types";

interface PasswordResetEmailOptions {
  resetUrl: string;
  userName?: string;
}

export function passwordResetEmail(
  opts: PasswordResetEmailOptions,
): Pick<EmailMessage, "subject" | "html" | "text"> {
  const greeting = opts.userName ? `Hi ${opts.userName},` : "Hi,";

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="font-size: 24px; color: #111;">Reset your password</h1>
  <p>${greeting}</p>
  <p>We received a request to reset your Repro account password. Click the button below to set a new password.</p>
  <p style="margin: 32px 0;">
    <a href="${opts.resetUrl}" style="background-color: #111; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">Reset password</a>
  </p>
  <p>If you didn't request this, you can safely ignore this email. The link will expire in 1 hour.</p>
  <p>If the button doesn't work, copy and paste this URL into your browser:</p>
  <p style="word-break: break-all; color: #666;">${opts.resetUrl}</p>
</body>
</html>`;

  const text = `${greeting}

We received a request to reset your Repro account password.

Reset your password: ${opts.resetUrl}

If you didn't request this, you can safely ignore this email. The link will expire in 1 hour.`;

  return {
    subject: "Reset your Repro password",
    html,
    text,
  };
}
