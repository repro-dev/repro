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
   - Example: `@repro/domain` might depend on `@repro/std` and `@repro/shared-types`
   - If `@repro/std` changes, the lock file updates, but it's not in the direct deps list
   - Result: Unnecessary fallback trigger (rebuilds unnecessarily)

2. **Shared Package Dependencies**: Multiple apps share the same packages
   - Example: Both api-server and workspace use @repro/domain
   - Changes to transitive deps of domain affect all consumers
   - Need to track the full graph, not just direct imports

3. **Moon's `^:build` Semantics**: 
   - `deps: [^:build]` means "run build on all upstream packages"
   - "Upstream" is determined by package.json `dependencies`
   - But Moon walks the entire transitive graph
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
│   └── depends on: @repro/std
│       └── depends on: @repro/shared-types
├── depends on: @repro/validation
│   └── depends on: @repro/std
```

**Current approach would miss**: If `@repro/shared-types` changes (not in DIRECT_DEPS), 
pnpm-lock.yaml updates, trigger occurs, but the solution doesn't account for this.

## Better Approach: Compute Full Dependency Graph

### Option 1: Moon Command Integration (STRONGLY RECOMMENDED) ⭐

**Approach**: Invoke `moon project` to leverage Moon's own dependency graph computation.

**Why This is Better**:
- ✓ Moon already computes the full transitive dependency graph correctly
- ✓ Uses the source of truth (Moon's internal resolution)
- ✓ Automatically handles all edge cases and resolution rules
- ✓ Stays in sync with Moon's behavior (no drift)
- ✓ Works with all dependency types (implicit, explicit, etc.)
- ✓ Significantly simpler than manual parsing
- ✓ No need to duplicate Moon's dependency resolution logic

**Moon Command**:
```bash
moon project <project-id> --json | jq '.config.dependsOn[] | select(.scope == "production") | .id'
```

**Example Output**:
```
"repro/domain"
"repro/future-utils"
"repro/validation"
"repro/wire-formats"
"repro/tdl"
"repro/random-string"
```

**Implementation**:
```python
def get_moon_dependencies(project_id, root_path):
    """
    Get all production dependencies for a project using Moon's built-in resolver.
    
    Args:
        project_id: e.g., 'repro/api-server'
        root_path: Project root directory
    
    Returns:
        set of package names (without 'repro/' prefix)
    """
    import json
    import subprocess
    
    try:
        # Call moon to get project info as JSON
        result = subprocess.run(
            ['moon', 'project', project_id, '--json'],
            cwd=root_path,
            capture_output=True,
            text=True,
            timeout=10
        )
        
        if result.returncode != 0:
            fail(f'Moon command failed: {result.stderr}')
        
        # Parse JSON response
        project_info = json.loads(result.stdout)
        
        # Extract production dependencies
        deps = set()
        for dep in project_info.get('config', {}).get('dependsOn', []):
            # Filter for production scope and repro packages
            if dep.get('scope') == 'production' and dep.get('id', '').startswith('repro/'):
                pkg_name = dep['id'].replace('repro/', '')
                deps.add(pkg_name)
        
        return deps
    except Exception as e:
        fail(f'Error computing dependencies: {e}')
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
    os.path.join(PROJECT_ROOT, f'packages/{dep}/package.json')
    for dep in ALL_DEPS
])
```

---

### Option 2: Automated Dependency Discovery (Fallback)

**Approach**: Automatically parse package.json files to build the full transitive graph.

**Implementation**:
```python
import json
import os

def get_all_package_dependencies(app_name, root_path):
    """
    Recursively build set of all @repro/* packages this app depends on
    (including transitive dependencies).
    """
    visited = set()
    to_visit = []
    
    # Start with direct deps
    pkg_path = f"{root_path}/apps/{app_name}/package.json"
    with open(pkg_path) as f:
        pkg = json.load(f)
        for dep in pkg.get('dependencies', {}):
            if dep.startswith('@repro/'):
                package_name = dep.replace('@repro/', '')
                to_visit.append(package_name)
    
    # Walk the full graph
    while to_visit:
        pkg_name = to_visit.pop()
        if pkg_name in visited:
            continue
        visited.add(pkg_name)
        
        # Load this package's dependencies
        dep_path = f"{root_path}/packages/{pkg_name}/package.json"
        if os.path.exists(dep_path):
            with open(dep_path) as f:
                pkg = json.load(f)
                for dep in pkg.get('dependencies', {}):
                    if dep.startswith('@repro/') and dep not in visited:
                        package_name = dep.replace('@repro/', '')
                        to_visit.append(package_name)
    
    return visited

# Usage in Tiltfile:
ALL_DEPS = get_all_package_dependencies('api-server', PROJECT_ROOT)

fall_back_on([
    os.path.join(PROJECT_ROOT, 'apps/api-server/package.json'),
    os.path.join(PROJECT_ROOT, 'apps/api-server/moon.yml'),
] + [
    os.path.join(PROJECT_ROOT, f'packages/{dep}/package.json')
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

### Option 2: Use Moon's Dependency Analysis

**Approach**: Query Moon's internal dependency graph (if exposed).

**Challenge**: Moon doesn't currently expose its dependency graph in a standard format.

**Potential Solution**: 
```bash
moon query projects --scope @repro/api-server
# Could return all upstream dependencies
```

**Status**: Would require Moon enhancement or workaround.

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
   - Parse package.json files to build full graph
   - Generate comprehensive fall_back_on list
   - No manual maintenance needed

3. **Future Enhancement**: Monitor Moon for better integration
   - Await Moon's dependency graph API
   - Consider contributing feature if needed

## Implementation: Enhanced Phase 3

### Step 1: Create Dependency Graph Helper

**File**: `infra/tilt-lib/dependency_graph.py`

```python
"""
Tilt helper for computing monorepo dependency graphs.

Usage in Tiltfile:
  load_dynamic('./tilt-lib/dependency_graph.py')
  deps = compute_all_dependencies('api-server', PROJECT_ROOT)
"""

import json
import os

def compute_all_dependencies(app_name, root_path):
    """
    Compute full transitive dependency graph for an app.
    
    Returns:
        set of @repro/* package names (without @repro/ prefix)
    """
    visited = set()
    to_visit = []
    
    # Load direct dependencies from app
    app_pkg_path = os.path.join(root_path, f'apps/{app_name}/package.json')
    try:
        with open(app_pkg_path) as f:
            pkg_json = json.load(f)
            deps = pkg_json.get('dependencies', {})
            for dep_name in deps:
                if dep_name.startswith('@repro/'):
                    pkg_name = dep_name.replace('@repro/', '')
                    to_visit.append(pkg_name)
    except:
        fail(f'Could not read {app_pkg_path}')
    
    # Traverse dependency tree
    while to_visit:
        pkg_name = to_visit.pop(0)
        
        # Skip if already visited
        if pkg_name in visited:
            continue
        visited.add(pkg_name)
        
        # Load package's dependencies
        pkg_path = os.path.join(root_path, f'packages/{pkg_name}/package.json')
        if not os.path.exists(pkg_path):
            # Package might not exist or might be external
            continue
        
        try:
            with open(pkg_path) as f:
                pkg_json = json.load(f)
                deps = pkg_json.get('dependencies', {})
                for dep_name in deps:
                    if dep_name.startswith('@repro/'):
                        pkg_name = dep_name.replace('@repro/', '')
                        if pkg_name not in visited:
                            to_visit.append(pkg_name)
        except:
            # Skip packages that can't be parsed
            pass
    
    return visited
```

### Step 2: Use in Tiltfile

**File**: `infra/apps/api-server/Tiltfile` (Phase 3)

```python
PROJECT_ROOT = os.path.join(os.getcwd(), '../../..')

# Import dependency graph helper
load('../../../infra/tilt-lib/dependency_graph.py')  # or define inline

# Compute full transitive dependency tree
ALL_DEPS = compute_all_dependencies('api-server', PROJECT_ROOT)

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
      os.path.join(PROJECT_ROOT, f'packages/{dep}/package.json')
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
#        @repro/domain depends on @repro/std
#        workspace depends on @repro/domain

tilt up api-server

# Scenario 1: Edit api-server source
cd apps/api-server && echo "// change" >> src/index.ts
# Expected: api-server rebuilds (sync + hot-reload) ✓

# Scenario 2: Edit direct dependency (domain)
cd packages/domain && echo "// change" >> src/index.ts
# Expected: api-server rebuilds (in dependency graph) ✓

# Scenario 3: Edit transitive dependency (std)
cd packages/std && echo "// change" >> src/index.ts
# Expected: api-server rebuilds (in transitive graph) ✓
#           workspace ALSO rebuilds (shares @repro/domain) ✓

# Scenario 4: Edit unrelated package (analytics-provider-mixpanel)
cd packages/analytics-provider-mixpanel && echo "// change" >> src/index.ts
# Expected: api-server does NOT rebuild (not in graph) ✓
```

## Summary Table

| Aspect | Phase 1-2 | Phase 3 (Manual List) | Phase 3 (Parse JSON) | Phase 3 (Moon Command) |
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

**Implement Option 1 (Moon Command Integration) for Phase 3** ⭐

**Why Moon Integration Wins**:
1. **Source of Truth**: Moon already computes dependencies correctly - use it directly
2. **Simplest Implementation**: Just call `moon project` and parse JSON
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
