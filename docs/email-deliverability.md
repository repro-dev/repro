# Email deliverability — repro.dev

Transactional mail for `repro.dev` uses Resend and the sender `noreply@repro.dev`.

## DNS checklist

1. Verify `repro.dev` in Resend.
2. Add the SPF records Resend shows for the send subdomain (default `send.repro.dev`):
   - MX for bounce handling
   - TXT `v=spf1 include:amazonses.com ~all`
3. Add the three DKIM CNAME records Resend generates.
4. Add DMARC at `_dmarc.repro.dev`:
   - start with `v=DMARC1; p=none; rua=mailto:dmarc@repro.dev;`
   - move to `quarantine` or `reject` once SPF/DKIM are stable

## Operational notes

- Keep `noreply@repro.dev` as the sender address in app config.
- Use the Resend dashboard to confirm the domain reaches `verified` before sending production mail.
- If mail lands in spam, review SPF, DKIM, and DMARC alignment first.
