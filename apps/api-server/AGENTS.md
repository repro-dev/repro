# api-server

## Structured Logging Contract

api-server emits structured JSON logs through the Pino/Fastify logger boundary (`createFastifyLoggerOptions` in `src/modules/logger.ts`). Downstream collectors (REP-1251) must expect the following stable fields.

### HTTP request lifecycle fields

Emitted by `registerRequestLoggingHooks` and `createRequestLogContext` in `src/modules/logger.ts`.

| Field                | Present on               | Description                                                 |
| -------------------- | ------------------------ | ----------------------------------------------------------- |
| `event`              | start / complete / error | `"http.request.start"`, `"http.request.complete"`, or `"http.request.error"` |
| `requestId`          | always                   | Fastify request ID (`req.id`)                               |
| `route`              | always                   | Matched route pattern (`req.routeOptions.url`)              |
| `method`             | always                   | HTTP method (`req.method`)                                  |
| `statusCode`         | complete only            | Response status code (`res.statusCode`)                     |
| `sessionSubjectType` | when session             | Session subject type (e.g. `"user"`)                        |
| `sessionSubjectId`   | when session             | Session subject ID                                          |
| `userId`             | when user-type           | Authenticated user ID                                       |
| `staffUserId`        | when staff-type          | Authenticated staff user ID                                 |
| `err`                | error only               | The error object                                            |

### Transactional email failure fields

Transactional email (verification, password reset, invitation) is delivered durably via the outbox worker as `email.send` jobs (REP-1249); `sendEmailInBackground` no longer exists. Failures surface on two distinct paths:

**Enqueue failure** (request process) — emitted by `createTransactionalEmailService` in `src/services/transactionalEmail.ts`. Non-blocking: the account action still succeeds even if enqueue fails.

| Field       | Always?       | Description                                                    |
| ----------- | ------------- | -------------------------------------------------------------- |
| `event`     | always        | `"transactional_email.enqueue_failed"`                         |
| `emailKind` | when supplied | e.g. `"verification"`, `"invitation"`, `"password_reset"`      |
| `err`       | always        | The error object from the failed enqueue                       |
| `context.*` | when supplied | Caller-supplied context fields (no PII)                        |

**Delivery failure** (outbox worker process) — provider send failures occur when the `email.send` handler runs. They are recorded on the `outbox_jobs` row as `lastError` (`{ name?, message, stack? }`): retryable failures are retried with backoff, terminal failures are marked after `maxAttempts`. There is no `transactional_email.send_failed` log event; inspect the outbox job's `status`/`lastError` for delivery outcome.

### Redaction

Sensitive fields are redacted by Pino before serialisation (see `createFastifyLoggerOptions` for the full path list). Redacted values appear as `"[Redacted]"` in log output. Covered paths: `req.headers.authorization`, `req.headers.cookie`, `req.body.password`, `req.body.newPassword`, `req.body.token`, `req.body.sessionToken`, `req.body.verificationToken`, `req.body.invitationToken`, `req.body.resetToken`, `req.body.secret`, `req.body.clientSecret`, `req.body.webhookSecret`, `res.headers["set-cookie"]`.

### Logger injection

Runtime infrastructure such as loggers is injected at the module/service factory boundary (`createEmailModule`, `createBillingService`, `createRecordingService`, `createOutboxWorker`, `createTransactionalEmailService`). Per-call arguments carry only event/request metadata — never `ApiLogger` or transport details.
