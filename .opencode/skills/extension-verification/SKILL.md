---
name: extension-verification
description: Browser-extension verification workflow with isolated profiles and worktree-scoped evidence.
---

# Extension Verification Skill

Use this skill when the changed surface is a browser extension rather than a normal app page. The normative workflow is `agent-browser`-centered; Playwright may remain only as a temporary migration detail if a specific setup still depends on it.

## What this skill covers

- popup and toolbar surfaces
- extension-host-page interaction
- evidence capture for extension-specific runs
- local browser setup for isolated extension verification

## Standard workflow

1. Start the required local surfaces with `reproctl start --wait <service>`.
2. Launch a fresh isolated browser profile with `agent-browser` and attach the extension build output from the current worktree.
3. Verify the extension surface, host-page interaction, and evidence capture in the same browser session.
4. Keep shared browser state in the main checkout `tmp/agent-browser/` tree and keep per-worktree artifacts under the worktree `tmp/` tree.

Extension runs drive the same `agent-browser` toolchain as app runs. If clicks or keypresses silently do nothing (`✓ Done` with no page response), suspect the toolchain before the extension — see the `ui-verification` skill's **Troubleshooting: silent browser input loss**.

## Local surfaces

Use the service that matches the extension you are verifying:

- `capture` for capture-extension work

The common pattern is to use `reproctl start --wait <service>` so the extension build/watch pipeline and any required local services are ready before browser automation begins.

## Attaching agent-browser to an isolated extension build

When the installed `agent-browser` launch does not accept extension-load flags, launch a headed Chromium directly with the worktree build and a loopback CDP port, then attach `agent-browser` to it. `agent-browser open` by itself launches its own browser and does not load a worktree extension.

For capture-extension work, first run `reproctl start --wait capture`, then use a fresh profile and the current worktree's `apps/capture/dist`:

```bash
EVIDENCE="$PWD/tmp/extension-verification/<issue-or-surface>"
mkdir -p "$EVIDENCE/profile" "$EVIDENCE/logs"
CHROME="$(pnpm exec node -e "console.log(require('@playwright/test').chromium.executablePath())")"
"$CHROME" \
  --remote-debugging-address=127.0.0.1 \
  --remote-debugging-port=9222 \
  --user-data-dir="$EVIDENCE/profile" \
  --disable-extensions-except="$PWD/apps/capture/dist" \
  --load-extension="$PWD/apps/capture/dist" \
  --no-first-run "$TARGET_URL" \
  >"$EVIDENCE/logs/chrome.log" 2>&1 &
agent-browser --session <worktree-scoped-session> connect 9222
```

Choose an unused CDP port. Use the headed browser for extension support; keep the profile and screenshots in the worktree evidence directory, and close the browser/session after verification. `reproctl launch capture` is a transitional preview that uses a persistent profile outside the worktree and does not expose a CDP port, so it is not the isolated attachment path.

## Shared browser state

Keep browser state that should survive across worktrees in the main checkout `tmp/` tree:

- profiles: `<main-checkout>/tmp/agent-browser/profiles/`
- auth: `<main-checkout>/tmp/agent-browser/auth/`
- cache/downloads: `<main-checkout>/tmp/agent-browser/cache/`

Use these paths for reusable `agent-browser` profiles, shared auth vault data, and optional cached downloads that multiple extension runs may reuse.

## Per-worktree artifacts

Keep run-specific artifacts under the worktree `tmp/` tree, typically below `tmp/extension-verification/<issue-or-surface>/...`:

- screenshots
- notes and logs
- disposable profile overrides for a single run

Suggested layout:

- `tmp/extension-verification/<issue-or-surface>/`
- `tmp/extension-verification/<issue-or-surface>/before/`
- `tmp/extension-verification/<issue-or-surface>/after/`
- `tmp/extension-verification/<issue-or-surface>/notes.md`
- `tmp/extension-verification/<issue-or-surface>/logs/`
- `tmp/extension-verification/<issue-or-surface>/profile/`

## Evidence layout

Keep the worktree-scoped profile disposable so parallel runs do not share browser state.

## Migration note

If a legacy Playwright launch path still exists, treat it as transitional only. Do not describe it as the target architecture for extension verification.
