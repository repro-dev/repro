import { FastifyPluginAsync } from 'fastify'
import { chain, fork, resolve } from 'fluture'
import { BillingWebhookService } from '~/services/billingWebhook'

export function createBillingWebhookRouter(
  billingWebhookService: BillingWebhookService
): FastifyPluginAsync {
  return async function (fastify) {
    fastify.addContentTypeParser(
      'application/json',
      { parseAs: 'string' },
      (_req, body, done) => {
        done(null, body)
      }
    )

    fastify.post('/', (req, res) => {
      const rawBody = req.body as string
      const signature = req.headers['paddle-signature'] as string

      if (!signature) {
        res.status(400).send({ error: 'Missing paddle-signature header' })
        return
      }

      fork<Error>(error => {
        req.log.error(error, 'Webhook processing failed')
        res.status(500).send({ error: 'Internal server error' })
      })<{ eventId: string; skipped: boolean }>(result => {
        res.status(200).send({ eventId: result.eventId, ok: true })
      })(
        billingWebhookService.verifyAndRecord(rawBody, signature).pipe(
          chain(record => {
            if (record.skipped) {
              return resolve({ eventId: record.eventId, skipped: true })
            }

            switch (record.eventType) {
              case 'subscription.created':
                return billingWebhookService.handleSubscriptionCreated(
                  record.eventId,
                  record.data
                )

              case 'subscription.updated':
                return billingWebhookService.handleSubscriptionUpdated(
                  record.eventId,
                  record.data
                )

              case 'subscription.canceled':
                return billingWebhookService.handleSubscriptionCanceled(
                  record.eventId,
                  record.data
                )

              case 'subscription.paused':
                return billingWebhookService.handleSubscriptionPaused(
                  record.eventId,
                  record.data
                )

              case 'subscription.resumed':
                return billingWebhookService.handleSubscriptionResumed(
                  record.eventId,
                  record.data
                )

              case 'transaction.completed':
                return billingWebhookService.handleTransactionCompleted(
                  record.eventId,
                  record.data
                )

              case 'transaction.payment_failed':
                return billingWebhookService.handleTransactionPaymentFailed(
                  record.eventId,
                  record.data
                )

              default:
                return billingWebhookService.markFailed(
                  record.eventId,
                  `Unhandled event type: ${record.eventType}`
                )
            }
          })
        )
      )
    })
  }
}
