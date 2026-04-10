# API Server Skill

Load this skill when working in `apps/api-server` — adding routes, services, decorators, or middleware.

## Architecture overview

`apps/api-server` is a **Fastify** HTTP server. Services are plain factory functions (no DI framework). All async work uses `FutureInstance` from `fluture`, not Promises.

**Bootstrap** (`src/index.ts`):

- Instantiates services in dependency order, then calls `bootstrap(routers)` which registers all Fastify plugins under their URL prefixes.
- The billing webhook router is **conditionally registered** — only when `BILLING_STUBBED` is false AND both `PADDLE_API_KEY` and `PADDLE_WEBHOOK_SECRET` are set. Never assume the webhook route is available in dev.

## Service registry (src/index.ts)

| Constant             | Factory                                    | Notes                                                        |
| -------------------- | ------------------------------------------ | ------------------------------------------------------------ |
| `accountService`     | `createAccountService(db, email, billing)` | Receives billingService for free-plan provisioning at signup |
| `billingService`     | `createBillingService(db, env)`            | Optional injected PaddleClient for testing                   |
| `agenticService`     | `createAgenticService(db, httpClient)`     |                                                              |
| `oauthService`       | `createOAuthService(db)`                   |                                                              |
| `apiKeyService`      | `createApiKeyService(db)`                  |                                                              |
| `featureGateService` | `createFeatureGateService(db)`             |                                                              |
| `socialAuthService`  | `createSocialAuthService(db)`              |                                                              |
| `projectService`     | `createProjectService(db)`                 |                                                              |
| `recordingService`   | `createRecordingService(db, storage)`      |                                                              |
| `healthService`      | `createHealthService(db, storage)`         |                                                              |

Social auth and API keys are co-registered under `/account` via `accountPlugins`.

## Response utilities (`src/utils/response.ts`)

**Always use these — never call `res.status().send()` directly.**

```ts
const { respondWith, respondWithValue, respondWithError } =
  createResponseUtils(config);

// Fork a Future and write the HTTP response
respondWith(res, someFuture);
respondWith(res, someFuture, 201); // custom status for success

// Write a plain value (no Future)
respondWithValue(res, someObject);
respondWithValue(res, null); // sends 204

// Write an error directly
respondWithError(res, someError);
```

`respondWith` automatically forks the Future — you do not call `fork` yourself in route handlers.

**Error → HTTP status mapping** (automatic in `respondWithError`):

| Error constructor      | HTTP status |
| ---------------------- | ----------- |
| `notFound()`           | 404         |
| `notAuthenticated()`   | 401         |
| `permissionDenied()`   | 403         |
| `badRequest()`         | 400         |
| `resourceConflict()`   | 409         |
| `tooManyRequests()`    | 429         |
| `notImplemented()`     | 501         |
| `serviceUnavailable()` | 503         |
| anything else          | 500         |

In debug mode (`config.debug = true`), the actual error message is exposed on 500/503. In production it is redacted to a generic string.

## Named errors (`src/utils/errors.ts`)

All domain errors are **named singletons** — use the factory functions and `is*` predicates:

```ts
import {
  notAuthenticated,
  isNotAuthenticated,
  permissionDenied,
  isPermissionDenied,
  notFound,
  isNotFound,
  badRequest,
  isBadRequest,
  resourceConflict,
  isResourceConflict,
  serverError,
  isServerError,
  notImplemented,
  isNotImplemented,
  serviceUnavailable,
  isServiceUnavailable,
  tooManyRequests,
  isTooManyRequests,
} from "~/utils/errors";

// throw / reject with
return (
  reject(notFound("Recording not found"))
    // discriminate in chainRej
    .pipe(
      chainRej((err) => {
        if (isNotFound(err)) return reject(notFound("Wrapped message"));
        return reject(err);
      }),
    )
);
```

Do **not** use `instanceof` — errors are registered by name, not prototype chain.

## ID encoding (`src/modules/database/helpers.ts`)

Database IDs are sequential integers internally. They are **always encoded to opaque strings** before being sent to clients using [Sqids](https://sqids.org/):

```ts
import { encodeId, decodeId, withEncodedId } from "~/modules/database/helpers";

encodeId(42); // → "abc1234" (7+ char opaque string)
decodeId("abc1234"); // → 42 | null  (null on invalid input)
withEncodedId(row); // Omit<T, 'id'> & { id: string } — replaces numeric id in-place
```

**Rules:**

- Never expose raw numeric IDs to clients.
- Always call `decodeId` on incoming string IDs; reject with `badRequest()` if it returns `null`.
- Use `withEncodedId` on database rows before returning them to the client.

## Session / auth decorator (`src/decorators/session.ts`)

`createSessionDecorator` registers a Fastify preHandler that augments every `FastifyRequest` with:

```ts
interface FastifyRequest {
  session: Session | null; // null = unauthenticated
  user: User | StaffUser | null; // null = unauthenticated
  getCurrentUser(): FutureInstance<Error, User | StaffUser>; // rejects with notAuthenticated()
  getCurrentUserOrNull(): FutureInstance<Error, User | StaffUser | null>;
  createSession(user): FutureInstance<Error, void>;
  revokeSession(): FutureInstance<Error, void>;
}
```

**Dual auth**: The decorator checks two sources in order:

1. Cookie-based session (browser flows).
2. `Authorization: Bearer <api-key>` header (API key flows, optional — only when `apiKeyService` is passed).

`req.session` is `null` when unauthenticated; use `getCurrentUser()` in route handlers to reject unauthenticated requests automatically.

## Adding a new route module

1. Create `src/routers/<domain>.ts` exporting `createXxxRouter(service, accountService)`.
2. Create `src/services/<domain>.ts` exporting `createXxxService(db, ...)`.
3. Instantiate the service in `src/index.ts` and pass it to the router factory.
4. Add `const xxxRouter = createXxxRouter(...)` and register it in `bootstrap`.
5. Use `respondWith` / `respondWithValue` / `respondWithError` exclusively for HTTP responses.
6. Use `withEncodedId` on all outbound rows.

## Testing

Route tests use `app.inject()` (Fastify injection — no network). Service tests mock the database using `attemptQuery` wrappers. See `src/modules/*/router.test.ts` for patterns.
