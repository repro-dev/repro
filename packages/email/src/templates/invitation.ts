import { EmailMessage } from '../types'
import { escapeHtml } from './escapeHtml'

interface InvitationEmailOptions {
  invitationUrl: string
  workspaceName: string
  inviterName?: string
}

export function invitationEmail(
  opts: InvitationEmailOptions
): Pick<EmailMessage, 'subject' | 'html' | 'text'> {
  const invitedBy = opts.inviterName
    ? `${opts.inviterName} has invited you`
    : `You've been invited`
  const htmlInvitedBy = opts.inviterName
    ? `${escapeHtml(opts.inviterName)} has invited you`
    : `You've been invited`
  const workspaceName = escapeHtml(opts.workspaceName)
  const invitationUrl = escapeHtml(opts.invitationUrl)

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="font-size: 24px; color: #111;">You're invited to ${workspaceName}</h1>
  <p>${htmlInvitedBy} to join the <strong>${workspaceName}</strong> workspace on Repro.</p>
  <p style="margin: 32px 0;">
    <a href="${invitationUrl}" style="background-color: #111; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">Accept invitation</a>
  </p>
  <p>If you weren't expecting this invitation, you can safely ignore this email.</p>
  <p>If the button doesn't work, copy and paste this URL into your browser:</p>
  <p style="word-break: break-all; color: #666;">${invitationUrl}</p>
</body>
</html>`

  const text = `${invitedBy} to join the ${opts.workspaceName} workspace on Repro.

Accept your invitation: ${opts.invitationUrl}

If you weren't expecting this invitation, you can safely ignore this email.`

  return {
    subject: `You're invited to join ${opts.workspaceName} on Repro`,
    html,
    text,
  }
}
