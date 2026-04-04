# Authentication Skill

Load this skill when working on auth flows, session management, social login, invitations, feature gates, or the `packages/auth` frontend package.

## Package overview

`packages/auth` is a React component/hook library that wraps all frontend authentication concerns. The backend counterpart is `apps/api-server/src/modules/account/` and `apps/api-server/src/modules/oauth/`.

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

## Feature gates

Feature gates are string-keyed flags stored in the database. They are fetched client-side from `GET /feature-gates/enabled`. Use `useHasGate('gate-name')` in components, or `<IfGate gate="gate-name">` for declarative gating. The server-side service is `featureGateService`.

## Gotchas

- `$sessionLoading` is `true` on initial render. Always check it before redirecting unauthenticated users — otherwise you'll redirect before the session resolves. `RequireSession` handles this correctly; use it as the reference implementation.
- `basePath` must match the server's route prefix. Changing `AuthProvider`'s `basePath` without a corresponding server-side change breaks all auth calls silently.
- Social auth routes are co-registered under `/account` (not `/oauth`). Full paths are `/account/oauth/google` and `/account/oauth/google/callback`.
- `GateProvider` treats a failed `/feature-gates/enabled` fetch as "use fallback gates" rather than an error — it never throws or shows an error state.
