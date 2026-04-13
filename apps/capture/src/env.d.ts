// Type declarations for build-time injected environment variables.
// These are injected by vite.config.ts via the `define` block.

declare namespace NodeJS {
  interface ProcessEnv {
    GIT_BRANCH: string
    GIT_SLUG: string
    SENTRY_DSN: string
  }
}
