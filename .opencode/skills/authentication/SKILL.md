---
name: authentication
description: Auth workflows for sessions, social login, invitations, and feature gates.
---

# Authentication Skill

Load this skill when working on auth flows, session management, social login, invitations, feature gates, or the `packages/auth` frontend package.

## Package overview

`packages/auth` is a React component/hook library that wraps all frontend authentication concerns. The backend counterpart lives in `apps/api-server/src/services/` (e.g. `services/account.ts`, `services/oauth.ts`, `services/socialAuth.ts`) with routers in `apps/api-server/src/routers/` (e.g. `routers/account.ts`, `routers/oauth.ts`, `routers/socialAuth.ts`).

## Provider tree (frontend)

Two independent providers must be in scope:

```tsx
<AuthProvider basePath="/account">
  {" "}
  {/* session state + auth actions */}
  <GateProvider fallbackGates={[]}>
    {" "}
    {/* feature gate set */}
    <App />
  </GateProvider>
</AuthProvider>
```

- `AuthProvider` calls `loadSession()` automatically on mount.
- `basePath` defaults to `'/account'`. Staff auth uses `basePath="/staff"` to hit `/staff/login`, `/staff/me`, etc. The same `createState` handles both.
- `GateProvider` fetches `/feature-gates/enabled` and provides a `Set<string>` of enabled gate names. Pass `fallbackGates` for SSR or test environments where the API may be unavailable.

## Auth state (`createState`)

The state object exposes reactive atoms and action functions:

```ts
const state = createState({ apiClient, basePath });

state.$session; // Observable<User | StaffUser | null>
state.$sessionLoading; // Observable<boolean> — true until first loadSession completes

state.login(email, password); // FutureInstance<Error, User>
state.logout(); // FutureInstance<Error, void>
state.register(accountName, userName, email, pw); // FutureInstance<Error, User>
state.verify(token, email); // FutureInstance<Error, void>
state.resetPassword(email); // FutureInstance<Error, void>
state.confirmPasswordReset(token, newPassword); // FutureInstance<Error, void>
state.invite(email); // FutureInstance<Error, void>
state.acceptInvitation(token, name, email, pw); // FutureInstance<Error, void>
state.loadSession(); // FutureInstance<Error, User>
```

All action futures **must be forked** to execute. `login`, `register`, and `loadSession` update `$session` automatically on success via `tap(setSession)`.

## Hooks

Always consume auth state through hooks — never read `AuthContext` directly in app code.

| Hook                        | Returns                     | Notes                                 |
| --------------------------- | --------------------------- | ------------------------------------- |
| `useSession()`              | `User \| StaffUser \| null` | null while loading or unauthenticated |
| `useSessionLoading()`       | `boolean`                   | true until first session check        |
| `useLogin()`                | `login` fn                  |                                       |
| `useLogout()`               | `logout` fn                 |                                       |
| `useRegister()`             | `register` fn               |                                       |
| `useResetPassword()`        | `resetPassword` fn          |                                       |
| `useConfirmPasswordReset()` | `confirmPasswordReset` fn   |                                       |
| `useHasGate(gate: string)`  | `boolean`                   | true if gate is enabled               |
| `useAuthContext()`          | full state object           | last resort only                      |

## Conditional render components

| Component                  | Behaviour                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------ |
| `<IfSession>`              | Renders children only when session exists                                                  |
| `<UnlessSession>`          | Renders children only when no session                                                      |
| `<RequireSession>`         | Like `IfSession` but redirects to `/account/login` if unauthenticated after load completes |
| `<SessionRouteBoundary>`   | Route-level equivalent of `RequireSession`                                                 |
| `<IfGate gate="name">`     | Renders children when the named gate is enabled                                            |
| `<UnlessGate gate="name">` | Renders children when the named gate is disabled                                           |

## Social auth (Google)

`<GoogleSignInButton>` renders a Google OAuth button. It initiates the OAuth flow by calling `/account/oauth/google`. Google OAuth is only active when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set in the server env — if absent, `googleProvider` is `null` and the route is not registered. The button should be conditionally rendered based on whether the provider is configured.

## Backend auth endpoints (api-server)

All endpoints live under the `basePath` prefix:

| Method + Path                            | Action                               |
| ---------------------------------------- | ------------------------------------ |
| `POST /account/login`                    | Cookie session login                 |
| `POST /account/logout`                   | Revoke session cookie                |
| `POST /account/register`                 | Create account + user                |
| `POST /account/verify`                   | Email verification                   |
| `POST /account/reset-password`           | Send password-reset email            |
| `POST /account/reset-password/confirm`   | Apply password reset                 |
| `POST /account/invite`                   | Send member invitation               |
| `POST /account/accept-invitation`        | Accept + create user from invitation |
| `GET  /account/me`                       | Return current session user          |
| `GET  /account/oauth/:provider`          | Initiate OAuth                       |
| `GET  /account/oauth/:provider/callback` | OAuth callback                       |

OAuth routes are registered under `/account` via `socialAuthRouter` (see `accountPlugins` in `apps/api-server/src/index.ts`).

## Staff OAuth (Google)

Staff authentication uses a separate OAuth flow from the user-facing social auth, restricted exclusively to `@repro.dev` email addresses.

### Flow

```
Admin App → GET /staff/oauth/google → API server → redirect to Google login
                                                          ↓
Admin App ← redirect to /staff/oauth/google/callback ← Google callback
                                                          ↓
                    API server validates code, enforces @repro.dev domain,
                    creates/finds staff user, sets session cookie
                                                          ↓
                    Redirect to Admin App dashboard ← logged in
```

### Staff OAuth endpoints

All staff OAuth endpoints are registered under the `/staff` prefix and handled by `createStaffOAuthRouter` in `apps/api-server/src/routers/staffOAuth.ts`:

| Method + Path                       | Action                                    |
| ----------------------------------- | ----------------------------------------- |
| `GET /staff/oauth/:provider`        | Initiate OAuth flow (redirect to provider)|
| `GET /staff/oauth/:provider/callback` | Handle OAuth callback, create session   |

The staff OAuth routes are registered alongside `staffRouter` via `staffPlugins` in `apps/api-server/src/index.ts`. Only the `google` provider is currently supported for staff auth.

### Google Cloud Console configuration

Create an **OAuth 2.0 Client ID** of type **Web application** in the Google Cloud Console.

**Authorized JavaScript origins** (not required for the OAuth code flow, but set if needed):
- `https://admin.repro.dev`
- `https://admin.reproqa.dev`

**Authorized redirect URIs** (must match exactly):
- `https://api.repro.dev/staff/oauth/google/callback`
- `https://api.reproqa.dev/staff/oauth/google/callback`

The redirect URI points to the **API server** (`api.*`), not the Admin app — the API server handles the OAuth code exchange internally, then redirects the browser to the Admin app.

**Authorized domains**:
- `repro.dev`
- `reproqa.dev`

### Environment variables

Set these in the API server environment for each deployment:

| Variable               | Description                |
| ---------------------- | -------------------------- |
| `GOOGLE_CLIENT_ID`     | Google OAuth client ID     |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |

- Both vars are defined as `z.string().optional()` in `createEnv.ts`
- The `createGoogleProvider` function in `apps/api-server/src/index.ts` returns `null` when either var is absent, and the routes are omitted
- Locally, the vars are forwarded from host env via `infra/services.json` `env_passthrough` and `infra/apps/api-server/Tiltfile` `os.getenv()` calls

### Domain restriction

Staff OAuth is restricted to `@repro.dev` email addresses. See `ALLOWED_DOMAIN` in `apps/api-server/src/routers/staffOAuth.ts`. Non-`@repro.dev` users are redirected to `{REPRO_ADMIN_URL}/login?error=domain_not_allowed`. This is covered by `staffOAuth.test.ts`.

## Session lifetime policy

Browser auth uses opaque, cookie-backed server sessions rather than JWT access/refresh tokens. Session tokens are stored as hashes in the `sessions` table and the raw token is sent in the signed `SESSION_COOKIE`.

Subject-specific lifetime policy lives in `apps/api-server/src/services/sessionPolicy.ts`:

| Subject type | Soft cookie expiry | Hard server expiry |
| ------------ | ------------------ | ------------------ |
| `user`       | 30 days            | 90 days            |
| `staff`      | 12 hours           | 7 days             |

- `apps/api-server/src/decorators/session.ts` applies the soft cookie expiry on each response and caps it at the subject-specific hard expiry from `session.createdAt`.
- `apps/api-server/src/services/account.ts` enforces hard expiry in `getSessionByToken()` and deletes expired rows in `deleteExpiredSessions()` using the same policy.
- Synthetic API-key sessions use `id: ''` and must never write `Set-Cookie` headers.
- Do not reintroduce global `SESSION_SOFT_EXPIRY` / `SESSION_HARD_EXPIRY` behavior for workspace/admin sessions unless the product requirement explicitly calls for configurable policy.

## Feature gates

Feature gates are string-keyed flags stored in the database. They are fetched client-side from `GET /feature-gates/enabled`. Use `useHasGate('gate-name')` in components, or `<IfGate gate="gate-name">` for declarative gating. The server-side service is `featureGateService`.

## Gotchas

- `$sessionLoading` is `true` on initial render. Always check it before redirecting unauthenticated users — otherwise you'll redirect before the session resolves. `RequireSession` handles this correctly; use it as the reference implementation.
- `basePath` must match the server's route prefix. Changing `AuthProvider`'s `basePath` without a corresponding server-side change breaks all auth calls silently.
- Social auth routes are co-registered under `/account` (not `/oauth`). Full paths are `/account/oauth/google` and `/account/oauth/google/callback`.
- `GateProvider` treats a failed `/feature-gates/enabled` fetch as "use fallback gates" rather than an error — it never throws or shows an error state.
