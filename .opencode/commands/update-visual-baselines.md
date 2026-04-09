---
description: Regenerate visual regression baseline screenshots from the current main branch
---

You are regenerating the visual regression baseline screenshots. These baselines are the reference images used by the `/lightspeed` pipeline to detect layout regressions in UI-touching PRs.

## Prerequisites

1. You must be on the **main** branch (not a worktree).
2. Storybook must be functional for the package you want to baseline.
3. Baselines are machine-local — they live in `tmp/visual-baselines/` (git-ignored) and are not committed to the repo.

## Steps

### 1. Verify you are on main

```sh
git rev-parse --abbrev-ref HEAD
```

If the output is not `main`, stop and ask the user to switch to main before running this command.

### 2. Determine the main checkout path

```sh
git rev-parse --show-toplevel
```

This is `<main-checkout>`. Use this value in the command below.

### 3. Run the baseline update

```sh
bash scripts/visual-regression.sh \
  --update-baselines \
  --worktree <main-checkout> \
  --main-checkout <main-checkout> \
  --stories '[]'
```

`--stories '[]'` means "capture all stories". To restrict to specific stories, provide a JSON array of story IDs (e.g. `'["button--primary","badge--default"]'`).

The script will:

1. Find the Storybook package (looks for `apps/storybook-ui` or a package with `.storybook/`)
2. Start Storybook on port 6099
3. Capture screenshots for all (or specified) stories
4. Write PNG files to `tmp/visual-baselines/`
5. Stop Storybook

### 4. Report results

After the script completes, count the baseline files written:

```sh
ls tmp/visual-baselines/*.png 2>/dev/null | wc -l
```

Report to the user: "Captured N baseline screenshots in `tmp/visual-baselines/`."

### 5. Notes

- Run `/update-visual-baselines` after any **intentional** visual change is merged to main (e.g. a design token update, a component refactor, a layout change that was reviewed and approved).
- Do **not** run this to suppress a failing visual check on a feature branch — that defeats the purpose of the guard.
- If a package has no Storybook setup, the script exits cleanly with a warning and zero baselines written for that package.
- Baselines are local only. If you're setting up a new machine, run this command once after cloning.
