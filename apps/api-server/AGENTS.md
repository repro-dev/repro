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

Emitted by `sendEmailInBackground` in `src/modules/email.ts`.

| Field       | Always?       | Description                                                    |
| ----------- | ------------- | -------------------------------------------------------------- |
| `event`     | always        | `"transactional_email.send_failed"`                            |
| `emailKind` | when supplied | e.g. `"verification"`, `"invitation"`, `"password_reset"`      |
| `err`       | always        | The error object from the failed send                          |
| `context.*` | when supplied | Caller-supplied context fields (no PII)                        |

### Redaction

Sensitive fields are redacted by Pino before serialisation (see `createFastifyLoggerOptions` for the full path list). Redacted values appear as `"[Redacted]"` in log output. Covered paths: `req.headers.authorization`, `req.headers.cookie`, `req.body.password`, `req.body.newPassword`, `req.body.token`, `req.body.sessionToken`, `req.body.verificationToken`, `req.body.invitationToken`, `req.body.resetToken`, `req.body.secret`, `req.body.clientSecret`, `req.body.webhookSecret`, `res.headers["set-cookie"]`.

### Logger injection

Runtime infrastructure such as loggers is injected at the module/service factory boundary (`createEmailModule`, `createBillingService`, `createRecordingService`, `createOutboxWorker`). Per-call arguments carry only event/request metadata — never `ApiLogger` or transport details.
