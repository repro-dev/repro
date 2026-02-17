# Troubleshooting

## Common Issues
- Checkout succeeds but subscription not visible: check webhook delivery and event processing logs.
- Access not updated after upgrade: ensure entitlements refresh on subscription update events.
- Payment failures not reflected: verify invoice and payment_failed webhook handling.

## Diagnostics
- Confirm webhook signing secret configuration.
- Validate provider event IDs are deduped.
- Inspect billing event logs for processing errors.
