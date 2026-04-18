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
4. Store screenshots, notes, and disposable profile data under `tmp/extension-verification/<issue-or-surface>/`.

## Local surfaces

Use the service that matches the extension you are verifying:

- `capture` for capture-extension work
- `dev-toolbar` for toolbar-extension work

The common pattern is to use `reproctl start --wait <service>` so the extension build/watch pipeline and any required local services are ready before browser automation begins.

## Evidence layout

Suggested artifact tree:

- `tmp/extension-verification/<issue-or-surface>/`
- `tmp/extension-verification/<issue-or-surface>/before/`
- `tmp/extension-verification/<issue-or-surface>/after/`
- `tmp/extension-verification/<issue-or-surface>/notes.md`
- `tmp/extension-verification/<issue-or-surface>/profile/`

Keep the profile disposable and worktree-scoped so parallel runs do not share browser state.

## Migration note

If a legacy Playwright launch path still exists, treat it as transitional only. Do not describe it as the target architecture for extension verification.
