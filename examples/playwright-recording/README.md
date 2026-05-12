# Playwright Recording Example

This example demonstrates how to use `@repro/recorder-node` to capture Repro recordings during Playwright test runs.

## Prerequisites

Set the following environment variables:

- `REPRO_API_KEY` — your Repro API key
- `REPRO_PROJECT_ID` — the project ID to upload recordings to

Optional:

- `REPRO_API_URL` — custom API base URL (defaults to `https://api.repro.localhost`)
- `REPRO_APP_URL` — custom app base URL (defaults to `https://app.repro.localhost`)

## Install

```sh
pnpm install
```

## Run

```sh
REPRO_API_KEY=your-key REPRO_PROJECT_ID=your-project-id pnpm test:e2e
```

## Notes

- Start recording **after** navigation. The library captures the current page state and all subsequent mutations.
- Avoid navigating after `startRecording()` unless you intentionally stop and restart the recorder on the new page.
