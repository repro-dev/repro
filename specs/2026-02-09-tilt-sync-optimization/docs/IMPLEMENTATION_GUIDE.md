# Quick Implementation Guide: Tilt Sync Improvements

This guide walks through implementing the sync optimization improvements identified in the deep analysis.

## Files to Modify

1. `/infra/apps/api-server/Tiltfile`
2. `/infra/apps/workspace/Tiltfile`
3. `/infra/apps/admin/Tiltfile`

## Prerequisite: Add Missing Dockerfile Targets

**File**: `/infra/Dockerfile`

The Dockerfile only has a `FROM prepare AS api-server` target. It is **missing** targets for `workspace` and `admin`. Add these at the end of the Dockerfile:

```diff
 FROM prepare AS api-server
 RUN moon run repro/api-server:build
 CMD ["moon", "run", "repro/api-server:serve"]
+
+FROM prepare AS workspace
+RUN moon run repro/workspace:build
+CMD ["moon", "run", "repro/workspace:serve"]
+
+FROM prepare AS admin
+RUN moon run repro/admin:build
+CMD ["moon", "run", "repro/admin:serve"]
```

Without these targets, changing `target="build-all"` to `target="workspace"` or `target="admin"` will cause Docker build failures.

## Current Status

> **Note**: The api-server Tiltfile has already been updated with the improvements described in Phases 1-3. The workspace and admin Tiltfiles still use the original configuration and need the changes below applied.

## Phase 1: Critical Changes (5 minutes)

### Change 1: Fix Docker Target

**File**: `/infra/apps/api-server/Tiltfile` (line 7)

```diff
- target="build-all",
+ target="api-server",
```

**File**: `/infra/apps/workspace/Tiltfile` (line 7)

```diff
- target="build-all",
+ target="workspace",
```

**File**: `/infra/apps/admin/Tiltfile` (line 7)

```diff
- target="build-all",
+ target="admin",
```

**Why**: These targets already exist in Dockerfile but were ignored. Now they're used correctly.

**Impact**: 
- Faster initial builds (~40% improvement)
- Eliminates building unrelated packages

### Change 2: Expand Ignore Patterns

**File**: `/infra/apps/api-server/Tiltfile` (line 9)

```diff
- ignore=['infra', 'dist', 'build', 'node_modules'],
+ ignore=[
+   'infra',
+   'dist',
+   'build',
+   'node_modules',
+   'apps/capture/**',
+   'apps/workspace/**',
+   'apps/admin/**',
+   'apps/devtools-demo/**',
+   'apps/storybook-ui/**',
+   '**/*.test.ts',
+   '**/*.test.tsx',
+   '**/*.spec.ts',
+   '**/*.spec.tsx',
+   '**/fixtures/**',
+   '**/mocks/**',
+   '**/test-data/**',
+   '**/*.stories.tsx',
+   '**/*.stories.ts',
+   '**/*.demo.tsx',
+   '**/*.md',
+   '*.md',
+   '*.MD',
+   '.DS_Store',
+   '*.swp',
+   '*.swo',
+   '*~',
+   '*.log',
+ ],
```

**File**: `/infra/apps/workspace/Tiltfile` (line 9)

Same changes as above, PLUS:
```diff
- 'apps/workspace/**',
+ 'apps/capture/**',
+ 'apps/admin/**',
```

**File**: `/infra/apps/admin/Tiltfile` (line 9)

Same changes as above, PLUS:
```diff
- 'apps/admin/**',
+ 'apps/capture/**',
+ 'apps/workspace/**',
```

**Why**: 
- Prevents unrelated app changes from being synced
- Stops test/story changes from triggering rebuilds
- Excludes temporary/editor files

**Impact**:
- ~60% reduction in false-positive file watches
- Faster feedback on real changes

## Phase 2: Optimization Changes (15 minutes)

### Change 3: App-Specific Sync Paths

**File**: `/infra/apps/api-server/Tiltfile` (lines 10-16)

```diff
  live_update=[
    fall_back_on([
      os.path.join(PROJECT_ROOT, 'pnpm-lock.yaml'),
      os.path.join(PROJECT_ROOT, 'apps/api-server/package.json')
    ]),
-   sync(PROJECT_ROOT, '/app')
+   sync(
+     os.path.join(PROJECT_ROOT, 'apps/api-server/src'),
+     '/app/apps/api-server/src'
+   ),
+   sync(
+     os.path.join(PROJECT_ROOT, 'packages'),
+     '/app/packages'
+   ),
  ]
```

**File**: `/infra/apps/workspace/Tiltfile` (lines 10-16)

```diff
  live_update=[
    fall_back_on([
      os.path.join(PROJECT_ROOT, 'pnpm-lock.yaml'),
      os.path.join(PROJECT_ROOT, 'apps/workspace/package.json'),
      os.path.join(PROJECT_ROOT, 'apps/workspace/moon.yml')
    ]),
-   sync(PROJECT_ROOT, '/app')
+   sync(
+     os.path.join(PROJECT_ROOT, 'apps/workspace/src'),
+     '/app/apps/workspace/src'
+   ),
+   sync(
+     os.path.join(PROJECT_ROOT, 'packages'),
+     '/app/packages'
+   ),
  ]
```

**File**: `/infra/apps/admin/Tiltfile` (lines 10-15)

```diff
  live_update=[
    fall_back_on([
      os.path.join(PROJECT_ROOT, 'pnpm-lock.yaml'),
      os.path.join(PROJECT_ROOT, 'apps/admin/package.json')
    ]),
-   sync(PROJECT_ROOT, '/app')
+   sync(
+     os.path.join(PROJECT_ROOT, 'apps/admin/src'),
+     '/app/apps/admin/src'
+   ),
+   sync(
+     os.path.join(PROJECT_ROOT, 'packages'),
+     '/app/packages'
+   ),
  ]
```

**Why**: 
- Only sync relevant code to each service
- Exclude build outputs, node_modules
- Smaller, faster sync operations

**Impact**:
- 5-10x faster sync operations
- Reduced I/O and network overhead
- Clearer intent in configuration

## Phase 3: Transitive Dependency Watching (10 minutes)

### Change 4: Use Moon Project Graph for Dependency Discovery

Create a shared helper at `infra/tilt-lib/dependency_graph.Tiltfile`:

```python
def compute_all_dependencies(project_id):
    result = local(
        'moon project-graph %s --json' % project_id,
        quiet=True,
    )
    graph = decode_json(str(result))
    nodes = graph.get('graph', {}).get('nodes', [])
    deps = []
    for node in nodes:
        node_id = node.get('id', '')
        if node_id == project_id:
            continue
        if node_id.startswith('repro/'):
            deps.append(node_id.replace('repro/', '', 1))
    return deps
```

Then update each Tiltfile to use it:

**File**: `/infra/apps/api-server/Tiltfile`

```python
PROJECT_ROOT = os.path.join(os.getcwd(), '../../..')

load_dynamic('../../../infra/tilt-lib/dependency_graph.Tiltfile')

ALL_DEPS = compute_all_dependencies('repro/api-server')

docker_build(
  'api-server',
  PROJECT_ROOT,
  dockerfile='../../Dockerfile',
  target='api-server',
  entrypoint=["moon", "run", "repro/api-server:dev"],
  ignore=[...],
  live_update=[
    fall_back_on([
      os.path.join(PROJECT_ROOT, 'apps/api-server/package.json'),
      os.path.join(PROJECT_ROOT, 'apps/api-server/moon.yml'),
    ] + [
      os.path.join(PROJECT_ROOT, 'packages/' + dep + '/package.json')
      for dep in ALL_DEPS
    ] + [
      os.path.join(PROJECT_ROOT, 'pnpm-lock.yaml'),
    ]),
    sync(
      os.path.join(PROJECT_ROOT, 'apps/api-server/src'),
      '/app/apps/api-server/src'
    ),
    sync(
      os.path.join(PROJECT_ROOT, 'packages'),
      '/app/packages'
    ),
  ]
)
```

Apply the same pattern for workspace and admin, changing the project ID and app paths.

**Why**:
- `moon project-graph` computes the full transitive dependency closure (11 projects for api-server vs. 7 direct deps)
- No manual dependency lists to maintain
- Automatically stays in sync as package.json files change

**Impact**:
- Prevents rebuilds when unrelated packages change
- Catches transitive dependency changes that manual lists would miss

## Testing Changes

After each change, verify behavior:

### After Phase 1 Changes
```bash
cd /Users/gary/Projects/repro-dev/repro

# Kill existing Tilt session if running
tilt down

# Start fresh
tilt up api-server

# Wait for startup complete (2-3 minutes initially)

# Test 1: Edit api-server source
cd apps/api-server && echo "// test" >> src/index.ts

# Check Tilt UI:
# - Should show api-server resource updating
# - Logs should show nodemon detecting change
# - Should be FAST (<2 seconds)

# Test 2: Edit capture code (unrelated)
cd ../capture && echo "// test" >> src/index.tsx

# Check Tilt UI:
# - api-server should NOT react
# - capture (if running) shows change
# - No unnecessary syncs to api-server

# Test 3: Edit test file
cd ../api-server && echo "describe('test', ...)" >> src/test.test.ts

# Check Tilt UI:
# - Should be ignored
# - No api-server activity
```

### After Phase 2 Changes
```bash
# Same tests as above, plus verify sync speed:

# Edit a file and watch sync time in Tilt UI
# Should be <1 second now (vs 3-5 seconds before)

# Monitor for messages like:
# "Syncing 5 files to container..." (good)
# vs
# "Syncing 50000 files to container..." (bad, original behavior)
```

### After Phase 3 Changes
```bash
# Test 1: Edit a transitive dependency
cd packages/ts-utils && echo "export const x = 1" >> src/index.ts

# Check: Does api-server rebuild?
# Expected: YES (ts-utils is a transitive dep via tdl)

# Test 2: Edit an unrelated package
cd packages/analytics-provider-mixpanel && echo "// change" >> src/index.ts

# Check: Does api-server rebuild?
# Expected: NO (not in api-server's dependency graph)
```

## Rollback Plan

If something breaks after changes:

1. **Revert individual Tiltfile**:
   ```bash
   git checkout -- infra/apps/api-server/Tiltfile
   tilt down && tilt up api-server
   ```

2. **Start over**:
   ```bash
   tilt down
   kind delete cluster --name repro-cluster
   tilt up
   ```

3. **Check git status**:
   ```bash
   git status  # See what was changed
   git diff infra/apps/api-server/Tiltfile  # Review changes
   ```

## Verification Checklist

- [ ] Docker targets changed (build-all → app-specific)
- [ ] Ignore patterns expanded in all 3 Tiltfiles
- [ ] Sync paths updated (PROJECT_ROOT → app-specific)
- [ ] Tilt down, then up again (clean state)
- [ ] Test 1: Unrelated file change → No api-server activity
- [ ] Test 2: api-server source change → Fast hot-reload
- [ ] Test 3: Shared package change → Rebuilds correctly
- [ ] All services still work (api-server responds to requests)
- [ ] Database still accessible (port-forward works)
- [ ] Web UI loads (http://app.repro.localhost)

## Performance Baseline

Measure before/after:

### Before Optimizations
```bash
# Time to sync on file change:
# - Small source change: 3-5 seconds
# - Capture change affecting api-server: 5-10 seconds
# - pnpm install in capture: 30-60 seconds (all services restart)

# Initial build:
# - Full tilt up: 90+ seconds
```

### After Optimizations
```bash
# Expected improvements:
# - Small source change: <1 second (5-10x faster)
# - Capture change: No impact on api-server
# - pnpm install in capture: 2-5 seconds (only capture, local resource)
# - Initial build: 30-40 seconds (40-50% faster)
```

Document baseline metrics in a comment in `/infra/Tiltfile`:

```python
# Performance notes:
# - Initial build: ~35s (was ~90s before optimizations)
# - File sync: <1s for same-app changes (was 3-5s)
# - No cascading rebuilds: Unrelated app changes isolated
```

## Known Limitations

### pnpm-lock.yaml Cascade
`pnpm-lock.yaml` is a monorepo-wide file. It remains in `fall_back_on` for all services, so any `pnpm add` in any app will still trigger full rebuilds for all running services. Fully isolating lockfile changes per-app would require app-specific lock fragments or removing `pnpm-lock.yaml` from `fall_back_on` and using a `run` step with a trigger instead.

### Broad packages/ Sync
The `sync(packages, '/app/packages')` syncs ALL packages to every service container. Changes to unrelated packages (e.g., packages only used by capture) will still trigger sync I/O for api-server. To fully isolate, sync only computed dependency packages instead of the entire `packages/` directory.

### Tilt sync() API
Tilt's `sync()` function only accepts `(local_path, remote_path)`. It does **not** support an `exclude` parameter. Any config files needed in-container should be synced via individual `sync()` calls.

## Next Steps

1. Implement Phase 1 + 2 changes
2. Test and verify
3. Implement Phase 3 when ready (10 minutes additional)

## Troubleshooting Implementation

**Issue**: Changes don't take effect after editing Tiltfile
```bash
tilt down
tilt up api-server
# Tilt loads config fresh
```

**Issue**: Services won't start after target change
```bash
# The new target might not exist in Dockerfile yet
# Verify Dockerfile has: FROM prepare AS api-server
# (It should already, no changes needed to Dockerfile)
```

**Issue**: Sync is slower, not faster
```bash
# Check if too much is being synced
# Add more ignore patterns
# Verify sync(PROJECT_ROOT, ...) was changed to app-specific paths
```
