# Tilt Docker Sync Analysis & Improvements

## Current Issues

### 1. **Over-broad Project Root Sync**
```python
sync(PROJECT_ROOT, '/app')  # Syncs entire monorepo to container
```
**Problem**: Every file change in any app or package gets synced, even if irrelevant.
- Workspace change → syncs entire repo
- Capture change → syncs to api-server/workspace containers
- Test file → syncs unnecessarily

### 2. **Overly Broad fall_back_on Triggers**
```python
fall_back_on([
  os.path.join(PROJECT_ROOT, 'pnpm-lock.yaml'),
  os.path.join(PROJECT_ROOT, 'apps/api-server/package.json')
])
```
**Problem**: ANY change to pnpm-lock triggers full rebuild, even when:
- Another app's dependencies changed (not api-server's)
- Lock file was regenerated without new dependencies
- Locked version of shared package changed but API didn't

**Root cause**: pnpm-lock.yaml is monorepo-wide. A change to capture's deps forces api-server rebuild.

### 3. **Insufficient Ignore Patterns**
```python
ignore=['infra', 'dist', 'build', 'node_modules']
```
**Missing patterns**:
- `**/*.test.ts`, `**/*.test.tsx` - tests shouldn't trigger restarts
- `**/*.md` - documentation
- `**/*.stories.tsx` - storybook files
- `**/fixtures/**`, `**/mocks/**` - test data
- `apps/storybook-ui/**` - unrelated app
- `apps/devtools-demo/**` - demo app
- `.DS_Store`, `*.swp`, `*.log` - editor files

### 4. **Monorepo Dependency Tree Not Optimized**
```yaml
# api-server/moon.yml
dev:
  deps:
    - ^:build  # ALL upstream packages rebuild
```

**Problem**: No distinction between:
- Direct dependencies: @repro/domain, @repro/validation (need to rebuild)
- Transitive dependencies: packages that api-server depends on indirectly
- Unrelated apps: capture, workspace, admin (should NOT rebuild)

Current setup rebuilds `packages/*:build` even if api-server doesn't import them.

### 5. **Wrong Docker Target**
```python
target="build-all",  # Builds all packages/apps, not just api-server
```
**Problem**: `moon run :build` in `build-all` target rebuilds entire monorepo unnecessarily.

Better approach:
- Use `target="api-server"` which only runs `moon run repro/api-server:build`
- Falls back to `scaffold` → `prepare` only if dependencies change

> **Note**: The Dockerfile currently only has a `FROM prepare AS api-server` target. Targets for `workspace` and `admin` must be added to the Dockerfile before changing those Tiltfiles.

## Sync Flow Analysis

```
File Change (e.g., apps/capture/src/Component.tsx)
    ↓
[Tilt detects change]
    ↓
sync(PROJECT_ROOT, '/app')  ← PROBLEM: Syncs everything
    ↓
[Container has file updated]
    ↓
fall_back_on([pnpm-lock.yaml, apps/api-server/package.json]) check
    ↓
[If unchanged → Only sync happens, entrypoint still runs]
    ↓
entrypoint=["moon", "run", "repro/api-server:dev"]
    ↓
[Moon checks ^:build dependencies]
    ↓
Rebuilds packages/* even if unrelated to capture
    ↓
Dev watcher starts (nodemon/dev-serve)
    ↓
[Slow feedback loop]
```

## Improved Solutions

### Solution 1: App-Specific Sync Directory
```python
docker_build(
  'api-server',
  PROJECT_ROOT,
  dockerfile='../../Dockerfile',
  target='api-server',  # Changed from build-all
  entrypoint=['moon', 'run', 'repro/api-server:dev'],
  ignore=[
    'infra',
    'dist',
    'build',
    'node_modules',
    'apps/capture/**',  # Exclude unrelated apps
    'apps/workspace/**',
    'apps/admin/**',
    'apps/devtools-demo/**',
    'apps/storybook-ui/**',
    '**/*.test.ts',
    '**/*.test.tsx',
    '**/*.stories.tsx',
    '**/*.md',
    '**/fixtures/**',
    '**/mocks/**',
  ],
  live_update=[
    fall_back_on([
      os.path.join(PROJECT_ROOT, 'pnpm-lock.yaml'),
      os.path.join(PROJECT_ROOT, 'apps/api-server/package.json'),
      os.path.join(PROJECT_ROOT, 'packages/domain/package.json'),  # Direct deps only
      os.path.join(PROJECT_ROOT, 'packages/validation/package.json'),
      os.path.join(PROJECT_ROOT, 'packages/wire-formats/package.json'),
    ]),
    sync(os.path.join(PROJECT_ROOT, 'apps/api-server/src'), '/app/apps/api-server/src'),
    sync(os.path.join(PROJECT_ROOT, 'packages'), '/app/packages'),
  ]
)
```

**Benefits**:
- Don't sync capture changes to api-server container
- Rebuilt only triggered by api-server or direct dependency changes
- Faster feedback loop

### Solution 2: Use Moon Docker Scaffold Properly
```python
# Remove target="build-all", use minimal target
docker_build(
  'api-server',
  PROJECT_ROOT,
  dockerfile='../../Dockerfile',
  target='api-server',  # Defined in Dockerfile, only builds api-server
  ...
)
```

Current Dockerfile has:
```dockerfile
FROM prepare AS api-server
RUN moon run repro/api-server:build
CMD ["moon", "run", "repro/api-server:serve"]
```

But Tiltfile uses `target="build-all"`, which defeats the purpose.

### Solution 3: Optimize fall_back_on Granularity
Instead of watching entire `pnpm-lock.yaml`, create an app-specific lock:
```python
fall_back_on([
  os.path.join(PROJECT_ROOT, 'pnpm-lock.yaml'),
  os.path.join(PROJECT_ROOT, 'apps/api-server/package.json'),
  os.path.join(PROJECT_ROOT, 'apps/api-server/moon.yml'),  # Catch build config changes
  # List only direct @repro/* dependencies
  os.path.join(PROJECT_ROOT, 'packages/domain/package.json'),
  os.path.join(PROJECT_ROOT, 'packages/validation/package.json'),
  os.path.join(PROJECT_ROOT, 'packages/wire-formats/package.json'),
  os.path.join(PROJECT_ROOT, 'packages/tdl/package.json'),
  os.path.join(PROJECT_ROOT, 'packages/future-utils/package.json'),
  os.path.join(PROJECT_ROOT, 'packages/random-string/package.json'),
])
```

**Problem**: Tedious and fragile (manual list of deps).

**Better approach**: Use `moon project-graph <id> --json` to compute the full transitive dependency closure, parse it in the Tiltfile.

### Solution 4: Two-Phase Live Update
```python
live_update=[
  fall_back_on([
    os.path.join(PROJECT_ROOT, 'pnpm-lock.yaml'),
    os.path.join(PROJECT_ROOT, 'apps/api-server/package.json'),
  ]),
  sync(os.path.join(PROJECT_ROOT, 'apps/api-server'), '/app/apps/api-server'),
  sync(os.path.join(PROJECT_ROOT, 'packages'), '/app/packages'),
  
  # Only restart for node_modules changes
  run('pnpm install --offline', trigger=[
    os.path.join(PROJECT_ROOT, 'pnpm-lock.yaml'),
  ]),
]
```

This way:
- Source code changes sync and hot-reload
- Dependency changes trigger install + restart
- Other app changes don't affect api-server

### Solution 5: Reduce Package Rebuilds with moon.yml Optimization
```yaml
# apps/api-server/moon.yml - Consider NOT including ^:build for dev task
dev:
  command: pnpm run dev-watch
  # Remove: deps: [^:build]
  # Rely on pre-built packages or built on first run
  preset: server
```

Rationale: In development, packages are already built (from CI or initial setup). Hot-reload of source suffices.

If a package changes: Developer explicitly rebuilds with `moon run packages/domain:build` first.

### Solution 6: Selective Resource Enablement
Already present but could be documented:
```
tilt up api-server  # Only api-server + dependencies (storage, database, gateway)
tilt up capture-only  # Only capture extension (fast)
tilt up workspace  # workspace + dependencies
```

This is good; encourage developers to use targeted groups.

## Recommended Changes (Priority Order)

### Priority 1: Change Docker Target (5 min)
**File**: `infra/apps/api-server/Tiltfile`, `infra/apps/workspace/Tiltfile`, `infra/apps/admin/Tiltfile`

```python
# Change:
target="build-all"
# To:
target="api-server"  # (or "workspace", "admin" respectively)
```

**Impact**: Reduces initial build time by ~40-60% (no unrelated package rebuilds).

### Priority 2: Expand Ignore Patterns (10 min)
**File**: All three Tiltfiles

```python
ignore=[
  'infra',
  'dist',
  'build',
  'node_modules',
  'apps/capture/**',
  'apps/workspace/**',
  'apps/admin/**',
  'apps/devtools-demo/**',
  'apps/storybook-ui/**',
  '**/*.test.ts',
  '**/*.test.tsx',
  '**/*.stories.tsx',
  '**/*.md',
  '**/fixtures/**',
  '**/mocks/**',
  '.DS_Store',
]
```

**Impact**: Reduces sync I/O by ~30-50% on file changes.

### Priority 3: App-Specific Sync Paths (15 min)
**File**: All three Tiltfiles

```python
live_update=[
  fall_back_on([
    os.path.join(PROJECT_ROOT, 'pnpm-lock.yaml'),
    os.path.join(PROJECT_ROOT, 'apps/api-server/package.json'),
  ]),
  sync(os.path.join(PROJECT_ROOT, 'apps/api-server/src'), '/app/apps/api-server/src'),
  sync(os.path.join(PROJECT_ROOT, 'packages'), '/app/packages'),
]
```

**Impact**: Prevents unrelated app changes from affecting dev loop.

### Priority 4: Refine fall_back_on with Package.json Hash (Medium effort)
Use a helper to list direct @repro/* dependencies from package.json, auto-generate watch list.

```python
# Helper function (use read_json() — Tilt builtin — not Python's open())
def get_dep_package_jsons(app_name, project_root):
  # Parse apps/APP/package.json, extract @repro/* deps
  # Return list of packages/*/package.json to watch
  ...
```

**Impact**: Prevents over-triggering rebuilds on unrelated package changes.

### Priority 5: Consider Two-Sync Strategy for Heavy Changes (Medium effort)
- Light sync for source changes (hot-reload)
- Heavy rebuild + restart for dependency changes

## Diagnostics

To confirm issues, in Tilt UI:
1. Edit a file in `apps/capture/src/Component.tsx`
2. Watch api-server container logs
3. Verify if `moon run repro/api-server:dev` triggers unnecessary rebuild

Expected behavior (after fixes):
- Change unrelated to api-server → NO rebuild, only sync if in fallback patterns
- Change to api-server source → sync + hot-reload (no restart)
- Change to shared package source → sync + hot-reload
- Change to any package.json → full rebuild

## Summary Table

| Issue | Current | Improved | Effort | Impact |
|-------|---------|----------|--------|--------|
| Docker target | build-all | app-specific | 5m | High |
| Ignore patterns | Minimal | Comprehensive | 10m | High |
| Sync scope | PROJECT_ROOT | App + packages only | 15m | High |
| fall_back_on | Monorepo-wide lock | App + direct deps | 20m | Medium |
| Package rebuilds | Always ^:build | Conditional | 30m | Medium |
| Docs | Missing | Complete | 10m | Low |
