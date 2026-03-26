% REPROCTL-LAUNCH(1) reproctl | Repro Development Tools
% Repro
% 2026

# NAME

reproctl-launch - open a service or browser in the current worktree context

# SYNOPSIS

**reproctl launch** *service* [**--worktree** *branch*]

# DESCRIPTION

Open a service URL in the browser, or launch the capture Chrome extension in a dedicated Playwright Chromium instance.

For web services (**workspace**, **api-server**, **admin**), the URL is resolved for the current worktree context and opened with **open**(1).

For **capture**, a pinned Playwright Chromium browser is launched with **--load-extension** pointing at the worktree's **apps/capture/dist/** directory. A persistent per-worktree user-data-dir is used at **~/.repro/browser-profiles/<slug>/** so browser state (cookies, DevTools settings) is preserved between launches. The workspace URL is also opened automatically in the same browser instance.

# OPTIONS

**--worktree** *branch*, **-w** *branch*
: Target a specific worktree instead of the current directory context.

**-h**, **--help**
: Show usage.

# SERVICES

**workspace**
: App frontend (app.repro.localhost or wt equivalent).

**api-server**
: API backend (api.repro.localhost or wt equivalent).

**admin**
: Admin panel (admin.repro.localhost or wt equivalent).

**capture**
: Launch the capture Chrome extension in a Playwright Chromium instance. Requires the extension to be built first (**moon run capture:build**).

# EXAMPLES

reproctl launch workspace
: Open the workspace in the default browser.

reproctl launch capture
: Launch Chromium with the capture extension from the current worktree.

reproctl launch capture --worktree feat/my-feature
: Launch Chromium with the capture extension from a specific worktree.

reproctl launch api-server --worktree feat/my-feature
: Open the API for a specific worktree.

# SEE ALSO

**reproctl**(1), **reproctl-worktree**(1)
