# Dependency Graph Analysis & Phase 3 Refinement

**Issue Identified**: Phase 3 (Direct Dependency Watching) does not properly account for the full transitive dependency graph between apps and packages.

## Problem Statement

The current implementation (Tiltfile.improved) lists only **direct dependencies** for each app:

```python
DIRECT_DEPS = [
  'domain',
  'future-utils',
  'random-string',
  'tdl',
  'validation',
  'wire-formats',
]
```

**But this is incomplete because:**

1. **Transitive Dependencies**: Packages themselves have dependencies on other packages
   - Example: `@repro/domain` depends on `@repro/random-string`, `@repro/tdl`, and `@repro/shared-types`
   - If `@repro/shared-types` changes, the lock file updates, but it's not in the direct deps list
   - Result: Unnecessary fallback trigger (rebuilds unnecessarily)

2. **Shared Package Dependencies**: Multiple apps share the same packages
   - Example: Both api-server and workspace use @repro/domain
   - Changes to transitive deps of domain affect all consumers
   - Need to track the full graph, not just direct imports

3. **Moon's `^:build` Semantics**: 
   - `deps: [^:build]` means "run `:build` on direct `dependsOn` projects"
   - Each dependent project's `build` task also has `deps: [^:build]` (inherited from `.moon/tasks/node.yml`)
   - Moon's task scheduler recursively expands through the full graph at runtime
   - So transitive execution is effectively achieved, but via recursive task expansion — not a single `^:build` expansion
   - Current solution doesn't account for this

## Current Limitations

### Limitation 1: Manual Dependency List
**File**: `infra/apps/api-server/Tiltfile.improved` (lines 13-20)

```python
DIRECT_DEPS = [
  'domain',
  'future-utils',
  'random-string',
  'tdl',
  'validation',
  'wire-formats',
]
```

**Problem**: 
- Must be manually maintained
- When a new dependency is added, must update this list
- Fragile - easy to miss a dependency
- Doesn't account for transitive dependencies at all

### Limitation 2: Full pnpm-lock.yaml Still Used as Fallback
**Current Code**:
```python
fall_back_on([
  os.path.join(PROJECT_ROOT, 'pnpm-lock.yaml'),  # ← Still triggers on ANY change
  os.path.join(PROJECT_ROOT, 'apps/api-server/package.json'),
] + get_direct_dep_paths() + [...])
```

**Problem**:
- pnpm-lock.yaml includes ALL packages in the monorepo
- A change to packages/storybook (unrelated) still updates it
- Still triggers unnecessary rebuilds
- Doesn't solve the root problem

### Limitation 3: No Transitive Dependency Tracking
**Example Scenario**:
```
api-server
├── depends on: @repro/domain
│   ├── depends on: @repro/random-string
│   ├── depends on: @repro/tdl
│   │   └── depends on: @repro/ts-utils
│   └── depends on: @repro/shared-types
├── depends on: @repro/wire-formats
│   ├── depends on: @repro/stream-utils
│   └── depends on: @repro/testing-utils
├── depends on: @repro/validation
```

**Current approach would miss**: If `@repro/ts-utils` changes (not in DIRECT_DEPS), 
pnpm-lock.yaml updates, trigger occurs, but the solution doesn't account for this.

## Better Approach: Compute Full Dependency Graph

### Option 1: Moon Project Graph Integration (STRONGLY RECOMMENDED) ⭐

**Approach**: Invoke `moon project-graph` to leverage Moon's own dependency graph computation for the full transitive closure.

**Why This is Better**:
- ✓ Moon already computes the full transitive dependency graph correctly
- ✓ Uses the source of truth (Moon's internal resolution)
- ✓ Automatically handles all edge cases and resolution rules
- ✓ Stays in sync with Moon's behavior (no drift)
- ✓ Works with all dependency types (implicit, explicit, etc.)
- ✓ Significantly simpler than manual parsing
- ✓ No need to duplicate Moon's dependency resolution logic

**Important Distinction**:
- `moon project <id> --json` returns only **direct** dependencies via `config.dependsOn` (7 for api-server)
- `moon project-graph <id> --json` returns the **full transitive closure** as a graph of nodes and edges (11 projects for api-server)

**Moon Command**:
```bash
moon project-graph repro/api-server --json
```

**Example Output** (Moon v1.41.5):
The output has structure `{ "graph": { "nodes": [...], "edges": [...] } }` where each node has an `id` field. For `repro/api-server`, the full transitive closure includes 11 projects:
```
repro/api-server
repro/domain
repro/future-utils
repro/random-string
repro/tdl
repro/testing-utils
repro/ts-utils
repro/validation
repro/wire-formats
shared-types
stream-utils
```

**Implementation**:
```python
def get_moon_dependencies(project_id, root_path):
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
            pkg_name = node_id.replace('repro/', '', 1)
            deps.append(pkg_name)

    return deps
```

**Benefits**:
- ✓ Single source of truth
- ✓ Full transitive graph included automatically
- ✓ No manual list maintenance
- ✓ Works across monorepo changes
- ✓ Leverages existing Moon infrastructure

**Example Usage in Tiltfile**:
```python
ALL_DEPS = get_moon_dependencies('repro/api-server', PROJECT_ROOT)

fall_back_on([
    os.path.join(PROJECT_ROOT, 'apps/api-server/package.json'),
    os.path.join(PROJECT_ROOT, 'apps/api-server/moon.yml'),
] + [
    os.path.join(PROJECT_ROOT, 'packages/%s/package.json' % dep)
    for dep in ALL_DEPS
])
```

---

### Option 2: Automated Dependency Discovery (Fallback)

**Approach**: Automatically parse package.json files to build the full transitive graph.

**Implementation**:
```python
def get_all_package_dependencies(app_name, root_path):
    visited = {}
    to_visit = []

    pkg_path = os.path.join(root_path, 'apps/%s/package.json' % app_name)
    pkg = read_json(pkg_path)
    for dep in pkg.get('dependencies', {}).keys():
        if dep.startswith('@repro/'):
            package_name = dep.replace('@repro/', '', 1)
            to_visit.append(package_name)

    for i in range(len(to_visit)):
        pkg_name = to_visit[i]
        if pkg_name in visited:
            continue
        visited[pkg_name] = True

        dep_path = os.path.join(root_path, 'packages/%s/package.json' % pkg_name)
        if not os.path.exists(dep_path):
            continue

        dep_pkg = read_json(dep_path)
        for dep in dep_pkg.get('dependencies', {}).keys():
            if dep.startswith('@repro/'):
                child_name = dep.replace('@repro/', '', 1)
                if child_name not in visited:
                    to_visit.append(child_name)

    return visited.keys()

ALL_DEPS = get_all_package_dependencies('api-server', PROJECT_ROOT)

fall_back_on([
    os.path.join(PROJECT_ROOT, 'apps/api-server/package.json'),
    os.path.join(PROJECT_ROOT, 'apps/api-server/moon.yml'),
] + [
    os.path.join(PROJECT_ROOT, 'packages/%s/package.json' % dep)
    for dep in ALL_DEPS
])
```

**Benefits**:
- ✓ Automatically discovers full transitive graph
- ✓ No manual maintenance
- ✓ Accounts for transitive dependencies
- ✓ Updates when package.json changes

**Drawbacks**:
- Slightly more complex
- Requires JSON parsing in Tiltfile
- Duplicates Moon's dependency resolution logic

### Option 3: Generate Lock File Fragment

**Approach**: Create a dependency-specific lock file instead of watching all files.

**Implementation**: 
- Extract only entries from pnpm-lock.yaml relevant to this app
- Create `pnpm-lock.api-server.yaml` (not committed)
- Watch only that file
- Regenerate when app's package.json changes

**Benefits**:
- ✓ Accounts for full transitive dependencies
- ✓ Watches only relevant lock entries
- ✓ Automatic updates

**Drawbacks**:
- Requires build-time setup
- More complex to implement

## Recommended Solution: Option 1 + Smart Detection

**Hybrid Approach**:

1. **For Phase 1-2**: Use current approach (good enough for 80% benefit)
   - Manually list direct deps
   - Still prevents cascading between unrelated apps

2. **For Phase 3** (Advanced): Implement automated discovery
   - Use `moon project-graph` to compute full transitive graph
   - Generate comprehensive fall_back_on list
   - No manual maintenance needed

3. **Future Enhancement**: Monitor Moon for better integration
   - Track Moon releases for improved graph query APIs
   - Consider contributing feature if needed

## Implementation: Enhanced Phase 3

### Step 1: Create Dependency Graph Helper

**File**: `infra/tilt-lib/dependency_graph.Tiltfile`

```python
def compute_all_dependencies(project_id, root_path):
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
            pkg_name = node_id.replace('repro/', '', 1)
            deps.append(pkg_name)

    return deps
```

### Step 2: Use in Tiltfile

**File**: `infra/apps/api-server/Tiltfile` (Phase 3)

```python
PROJECT_ROOT = os.path.join(os.getcwd(), '../../..')

load_dynamic('../../../infra/tilt-lib/dependency_graph.Tiltfile')

ALL_DEPS = compute_all_dependencies('repro/api-server', PROJECT_ROOT)

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
      os.path.join(PROJECT_ROOT, 'packages/%s/package.json' % dep)
      for dep in ALL_DEPS
    ]),
    sync(...),
  ]
)
```

**Result**:
- ✓ Full transitive dependency graph computed automatically
- ✓ Only relevant packages trigger rebuilds
- ✓ No manual maintenance
- ✓ Proper handling of cascading dependencies

## Verification

### Test Scenario: Transitive Dependency Change

```bash
# Setup: api-server depends on @repro/domain
#        @repro/domain depends on @repro/tdl
#        @repro/tdl depends on @repro/ts-utils

tilt up api-server

# Scenario 1: Edit api-server source
cd apps/api-server && echo "// change" >> src/index.ts
# Expected: api-server rebuilds (sync + hot-reload) ✓

# Scenario 2: Edit direct dependency (domain)
cd packages/domain && echo "// change" >> src/index.ts
# Expected: api-server rebuilds (in dependency graph) ✓

# Scenario 3: Edit transitive dependency (ts-utils)
cd packages/ts-utils && echo "// change" >> src/index.ts
# Expected: api-server rebuilds (in transitive graph) ✓
#           workspace ALSO rebuilds (shares @repro/domain) ✓

# Scenario 4: Edit unrelated package (analytics-provider-mixpanel)
cd packages/analytics-provider-mixpanel && echo "// change" >> src/index.ts
# Expected: api-server does NOT rebuild (not in graph) ✓
```

## Summary Table

| Aspect | Phase 1-2 | Phase 3 (Manual List) | Phase 3 (Parse JSON) | Phase 3 (Moon Project Graph) |
|--------|----------|----------------------|----------------------|----------------------|
| Prevents unrelated app cascades | ✓ | ✓ | ✓ | ✓ |
| Handles direct deps correctly | ✗ | ✓ | ✓ | ✓ |
| Handles transitive deps | ✗ | ✗ | ✓ | ✓ |
| Manual maintenance required | - | ✓ (burden) | - | - |
| Automatic updates | - | ✗ | ✓ | ✓ |
| Uses Moon's resolver | - | ✗ | ✗ | ✓ |
| Complexity | Low | Medium | Medium | Low |
| Single source of truth | - | ✗ | ✗ | ✓ |

## Recommendation

**Implement Option 1 (Moon Project Graph Integration) for Phase 3** ⭐

**Why Moon Integration Wins**:
1. **Source of Truth**: Moon already computes dependencies correctly - use it directly
2. **Simplest Implementation**: Just call `moon project-graph` and parse JSON
3. **Future-Proof**: If Moon changes how it resolves deps, Tilt automatically adapts
4. **No Maintenance**: Dependencies update automatically as package.json changes
5. **Proven Correct**: Moon's resolver is battle-tested and handles all edge cases

**Implementation**:
- Create helper function `get_moon_dependencies(project_id, root_path)`
- Use in all three service Tiltfiles (api-server, workspace, admin)
- Test with verification scenarios below
- Document in IMPLEMENTATION_GUIDE.md

**Expected Outcome**:
- Full transitive dependency support
- Leverages existing Moon infrastructure
- Zero maintenance burden
- Production-ready implementation

---

**Updated**: 2026-02-09  
**Status**: Recommended enhancement to Phase 3  
**Impact**: Completes the dependency graph solution  
**Effort**: 30-45 minutes for full implementation
