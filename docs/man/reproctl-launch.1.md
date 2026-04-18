% REPROCTL-LAUNCH(1) reproctl | Repro Development Tools
% Repro
% 2026

# NAME

reproctl-launch - open a service or browser in the current worktree context

# SYNOPSIS

**reproctl launch** _service_ [**--worktree** *branch*]

# DESCRIPTION

Open a service URL in the browser, or launch the capture Chrome extension in a dedicated Playwright Chromium instance for transitional manual preview.

For web services, the URL is resolved from **infra/services.json** for the current worktree context and opened with **open**(1). Services with **launch.kind=url** and either **portless_name** or **port** are launchable; services without a browser URL remain start-only.

For **capture**, a pinned Playwright Chromium browser is launched with **--load-extension** pointing at the worktree's **apps/capture/dist/** directory. A persistent per-worktree user-data-dir is used at **~/.repro/browser-profiles/<slug>/** so browser state (cookies, DevTools settings) is preserved between launches. The workspace URL is also opened automatically in the same browser instance. Treat this as a transitional preview path, not the normative extension-verification workflow.

# OPTIONS

**--worktree** _branch_, **-w** _branch_
: Target a specific worktree instead of the current directory context.

**-h**, **--help**
: Show usage.

# SERVICES

The exact service list shown by **reproctl launch --help** is generated from **infra/services.json**. Today that includes **workspace**, **api-server**, **admin**, **capture**, **marketing**, and **storybook-ui**.

# EXAMPLES

reproctl launch workspace
: Open the workspace in the default browser.

reproctl launch capture
: Launch Chromium with the capture extension from the current worktree as a transitional manual preview path.

reproctl launch capture --worktree feat/my-feature
: Launch Chromium with the capture extension from a specific worktree as a transitional manual preview path.

reproctl launch api-server --worktree feat/my-feature
: Open the API for a specific worktree.

# SEE ALSO

**reproctl**(1), **reproctl-worktree**(1)
