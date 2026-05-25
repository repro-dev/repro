# Outbox worker

The outbox worker processes durable side-effect jobs stored in PostgreSQL in
`outbox_jobs`. Enqueue jobs from service code when the side effect should commit
atomically with domain data.

## Local run commands

- Moon: `moon run repro/api-server:worker-outbox`
- Package script: `pnpm --dir apps/api-server run worker:outbox`
- Tilt/portless local service: `outbox-worker`

The default registry is `apps/api-server/src/workers/outboxRegistry.ts`. It is
intentionally empty until product areas add handlers.

## Configuration

Configuration comes from `infra/services.json` plus
`apps/api-server/src/config/createEnv.ts` validation.

| Variable                             |  Default | Purpose                                      |
| ------------------------------------ | -------: | -------------------------------------------- |
| `OUTBOX_WORKER_POLL_INTERVAL_MS`     |   `1000` | Delay between polling loops.                 |
| `OUTBOX_WORKER_BATCH_SIZE`           |     `10` | Maximum jobs claimed per poll.               |
| `OUTBOX_WORKER_DEFAULT_MAX_ATTEMPTS` |      `3` | Default for enqueue calls without override.  |
| `OUTBOX_WORKER_RETRY_BASE_MS`        |   `1000` | First retry delay before exponential growth. |
| `OUTBOX_WORKER_RETRY_MAX_MS`         |  `60000` | Maximum retry delay.                         |
| `OUTBOX_WORKER_STALE_AFTER_MS`       | `300000` | Reclaim/health threshold for stuck jobs.     |

## Adding a handler

Add handlers in the central registry so dispatch stays typed and discoverable:

```ts
export const outboxRegistry = createOutboxRegistry({
  "recording.example": (payload, job) => {
    // return FutureInstance<Error, void>
  },
});
```

The handler must be idempotent. A job can be retried after a worker crash or a
handler failure.
Running jobs whose lock is older than `OUTBOX_WORKER_STALE_AFTER_MS` are
eligible to be reclaimed by another worker; fresh running jobs remain locked so
multiple workers do not process the same active claim.

## Enqueueing jobs and transactions

Use `enqueue()` for standalone side effects. Use `enqueueWithTransaction(trx, …)`
inside an existing Kysely transaction, or `withOutboxTransaction(action)` when
the caller wants the outbox service to make the transaction boundary explicit.

## Idempotency keys

Provide `idempotencyKey` when the same logical job may be enqueued more than
once. Reusing a key returns the original row with `deduplicated: true` and does
not create a duplicate job. Prefer stable keys derived from the domain entity and
operation, for example `recording-error-index:${recordingId}`.

Do not use an idempotency key when every event must produce a separate job.

## Inspecting failed or stale jobs

```sql
SELECT "id", "type", "attempts", "maxAttempts", "lastError", "updatedAt"
FROM "outbox_jobs"
WHERE "status" = 'failed'
ORDER BY "updatedAt" DESC;

SELECT "id", "type", "lockedBy", "lockedAt"
FROM "outbox_jobs"
WHERE "status" = 'running'
  AND "lockedAt" < NOW() - INTERVAL '5 minutes';
```
