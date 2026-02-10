# Tilt Configuration Reference

## Architecture Overview

This directory contains Tilt configuration for local Kubernetes development using kind (Kubernetes in Docker).

```
infra/
├── Tiltfile                 # Main entrypoint (delegates to apps)
├── Dockerfile               # Multi-stage Docker builds for services
├── cluster.yaml             # Kind cluster definition (via ctlptl)
├── local-cert-conf.ext      # TLS certificate configuration
├── apps/                    # Service-specific Tiltfiles
│   ├── capture/             # Browser extension (local resource)
│   ├── dev-toolbar/         # DevTools (local resource)
│   ├── data/                # PostgreSQL + SeaweedFS (Helm)
│   ├── gateway/             # nginx ingress (Helm)
│   ├── api-server/          # Backend API (Docker)
│   ├── workspace/           # Web app (Docker)
│   └── admin/               # Admin panel (Docker)
└── certs/                   # Generated TLS certificates
```

## Service Types

### Local Resources
- **capture**: Runs `moon run repro/capture:watch` on host
- **dev-toolbar**: Runs `moon run repro/dev-toolbar:watch` on host

**Characteristics**:
- No Docker container
- Hot-reload on file changes
- Faster feedback for UI development
- Use when iterating on extension UI

### Docker Resources
- **api-server**: Node.js backend (Fastify)
- **workspace**: React web app (Webpack)
- **admin**: Admin UI (similar to workspace)

**Characteristics**:
- Run in Kubernetes via Docker
- Live updates sync source code to container
- Dev tasks use watch mode (nodemon, webpack-dev-server)
- Slower feedback than local resources due to Docker overhead

### Infrastructure Services
- **database**: PostgreSQL (Helm: bitnami/postgresql)
- **storage**: SeaweedFS object storage (Helm: seaweedfs/seaweedfs)
- **ingress-controller**: nginx ingress (Helm: ingress-nginx/ingress-nginx)

**Characteristics**:
- Managed via Helm
- Long-lived (persist across restarts)
- Access via port forwarding (database: 5432)

## Configuration Groups

Defined in `/infra/Tiltfile` for selective startup:

```bash
tilt up capture-only        # Just capture + dependencies
tilt up dev-toolbar-only    # Just dev-toolbar
tilt up api-server          # api-server + infra (database, storage, gateway)
tilt up workspace           # workspace + infra
tilt up                     # All services (default)
```

## How File Changes Sync

### Detection Phase
```
File system event → Tilt file watcher detects change
```

### Ignore Phase
Tilt checks if file matches `ignore` patterns. If yes, no further action.

```python
ignore=[
  'infra',
  'node_modules',
  'dist',
  '**/*.test.ts',
  ...
]
```

### Watch Phase
For non-ignored files, Tilt checks which resources care about this file.

Each `docker_build()` call specifies:
- `PROJECT_ROOT` - Root directory to watch
- `ignore` - Files to exclude
- `live_update` - What to do when non-ignored files change

### Fallback Phase
`live_update` includes `fall_back_on()` which lists files that trigger container restart:

```python
fall_back_on([
  os.path.join(PROJECT_ROOT, 'pnpm-lock.yaml'),
  os.path.join(PROJECT_ROOT, 'apps/api-server/package.json'),
])
```

If ANY of these files changed → Full container restart (rebuild + reinitialize)

### Sync Phase
Other changes trigger `sync()` operations:

```python
sync(PROJECT_ROOT, '/app')  # Syncs changed file(s) to container
```

The entrypoint (dev task) is still running and detects file changes internally (via nodemon, webpack-dev-server, etc.).

### Container Phase
Dev task in container runs watch mode:

```python
entrypoint=["moon", "run", "repro/api-server:dev"]
```

Which executes: `pnpm run dev-watch` (nodemon)

This detects changes inside container and hot-reloads.

## Dockerfile Multi-stage Strategy

```dockerfile
FROM node:22-slim AS base
  # Install node, global tools

FROM base AS scaffold
  # Copy source, run moon docker scaffold
  # Creates optimal workspace layout

FROM base AS prepare
  # Copy scaffold output + patches
  # Run moon docker setup
  # Install dependencies

FROM prepare AS build-all
  RUN moon run :build
  # Builds entire monorepo (all packages and apps)

FROM prepare AS api-server
  RUN moon run repro/api-server:build
  # Builds ONLY api-server + its dependencies

FROM prepare AS workspace
  RUN moon run repro/workspace:build
  # Builds ONLY workspace + its dependencies

FROM prepare AS admin
  RUN moon run repro/admin:build
  # Builds ONLY admin + its dependencies
```

**Tiltfile uses**: Each service Tiltfile specifies its target:
- api-server Tiltfile: `target="api-server"`
- workspace Tiltfile: `target="workspace"`
- admin Tiltfile: `target="admin"`

This ensures minimal rebuild scope.

## Environment Variables

### Build-time (Helm values)
- `REPRO_APP_URL=http://app.repro.localhost`
- `REPRO_API_URL=http://api.repro.localhost`
- `REPRO_ADMIN_URL=http://admin.repro.localhost`
- `PORT=8080`
- `OPENROUTER_API_KEY` (from host env, optional)

### Runtime (passed to containers)
All Helm values are passed to container as environment variables via deployment specs.

### Local Resources
Environment variables passed directly:
```python
serve_env={
  'BUILD_ENV': 'development',
  'REPRO_APP_URL': 'http://app.repro.localhost',
  'REPRO_API_URL': 'http://api.repro.localhost'
}
```

## Networking

### Port Mappings (Host → Kind Node)
Defined in `cluster.yaml`:
```yaml
extraPortMappings:
  - containerPort: 80
    hostPort: 80    # HTTP
  - containerPort: 443
    hostPort: 443   # HTTPS
```

### Service Hostnames
```
app.repro.localhost        → workspace service (port 8080)
api.repro.localhost        → api-server service (port 8080)
admin.repro.localhost      → admin service (port 8080)
```

Configured via ingress in `apps/gateway/chart/`.

### Database Access
PostgreSQL port-forward: `localhost:5432`
```bash
# From host machine:
psql -h localhost -U repro -d repro
```

## Dependency Management

### Moon Task Dependencies
Each service defines dependencies in `moon.yml`:

```yaml
dev:
  deps:
    - ^:build
  # Means: Run all upstream packages' :build tasks first
```

**Upstream packages** (^) are determined by dependency tree in package.json.

Example: api-server depends on @repro/domain
```
api-server:dev depends on packages/domain:build
```

### Tilt Resource Dependencies
Tilt resources wait for other resources:

```python
resource_deps=['dependencies', 'database']
  # Wait for dependencies resource and database Helm chart to be ready
```

### Order of Startup
1. `dependencies` resource: Install node_modules (sequential, only once)
2. Infrastructure resources (parallel):
   - database (Helm PostgreSQL)
   - storage (Helm SeaweedFS)
3. Extension resources (parallel):
   - capture (local)
   - dev-toolbar (local)
4. API resources (parallel):
   - api-server (Docker)
5. Application resources (parallel):
   - workspace (Docker)
6. Gateway resources:
   - ingress-controller (Helm)
   - ingress routes (Kubernetes YAML)

## Common Tasks

### Restart a service
```bash
# In Tilt UI, click the service and hit "Restart Pod"
# Or from CLI:
kubectl rollout restart deployment/api-server
```

### View logs
```bash
# In Tilt UI: Click service → View logs
# Or from CLI:
kubectl logs deployment/api-server -f
```

### Run database queries
```bash
# Connect to PostgreSQL:
psql -h localhost -U repro -d repro -c "SELECT * FROM users;"

# Or use kubectl exec:
kubectl exec -it deployment/database-postgresql -- psql -U repro -d repro
```

### Check pod status
```bash
kubectl get pods
kubectl describe pod api-server-xxxx
kubectl get events --sort-by='.lastTimestamp'
```

### Enable specific services only
```bash
tilt up capture-only      # Just capture extension
tilt up api-server        # Backend only
tilt up workspace         # Full workspace + backend
```

### Rebuild a service cleanly
```bash
# Delete pod to force rebuild:
kubectl delete pod -l app=api-server
# Or trigger from Tilt UI
```

## Troubleshooting

### Service won't start
1. Check logs: Tilt UI → Service → Logs
2. Check pod events: `kubectl describe pod POD_NAME`
3. Check dependencies: `kubectl get pods` - are dependencies ready?

### File changes not syncing
1. Check file isn't in `ignore` list
2. Check fall_back_on files haven't changed (not triggering full rebuild)
3. Check container entrypoint is running (verify `moon run APP:dev` is active)

### Slow file sync
1. Check file size / number of files changed
2. Check ignore patterns are comprehensive
3. Consider using only needed resources: `tilt up api-server` vs `tilt up`

### Port conflicts
If ports 80/443 are already in use:
1. Check what's running: `lsof -i :80`
2. Kill conflicting process or use different port
3. Update cluster.yaml if needed

## Performance Tips

1. **Use config groups**: `tilt up capture-only` is faster than `tilt up` when you only need capture
2. **Minimize files synced**: Comprehensive ignore patterns prevent false-positive syncs
3. **Use local resources for UI work**: capture and dev-toolbar update faster
4. **Use Docker resources for API work**: Changes to api-server see full integration with database, storage, etc.
5. **Check moon tasks**: `moon list` shows all available tasks and their dependencies
6. **Monitor Tilt UI**: Watch resource timeline to see what's slow

## File Structure

### apps/api-server/
```
src/                    # Source code (synced to container)
  index.ts             # Entry point
  routes/              # Route handlers
  migrations/          # Database migrations
package.json           # Dependencies (watched for changes)
moon.yml               # Build/dev/serve tasks
nodemon-dev.json       # Watch configuration
tsconfig.json          # TypeScript config
```

### apps/workspace/
```
src/                    # React source
  components/
  pages/
  App.tsx
package.json            # Dependencies
webpack.config.js       # Build config
moon.yml                # Tasks
scripts/                # Build scripts
```

### packages/domain/
```
src/                    # Shared types and utilities
package.json            # Exports as @repro/domain
moon.yml
```

## Configuration Files

- **Tiltfile**: Main Tilt config (delegates to apps/)
- **Dockerfile**: Multi-stage builds for Docker images
- **cluster.yaml**: Kind cluster definition (via ctlptl)
- **apps/*/Tiltfile**: Per-service configuration
- **apps/*/chart/**: Helm charts for Kubernetes deployments
- **apps/data/storage-values.yaml**: SeaweedFS configuration

## Useful Commands

```bash
# Start development:
tilt up

# Start specific services:
tilt up api-server
tilt up capture-only

# Stop Tilt:
tilt down

# View cluster:
kubectl get all

# Port-forward manually:
kubectl port-forward svc/database-postgresql 5432:5432

# Check moon tasks:
moon list

# Run a task manually:
moon run repro/api-server:dev

# Rebuild a task:
moon run repro/api-server:build
```

## When to Use What

| Scenario | Command | Why |
|----------|---------|-----|
| Full development | `tilt up` | All services available |
| UI iteration | `tilt up capture-only` | Fast hot-reload, no server overhead |
| API development | `tilt up api-server` | Backend + infra, no workspace UI |
| Debugging | `kubectl logs -f POD` | See exactly what's happening |
| Fresh start | `tilt down` then `tilt up` | Clean slate, flushes caches |
| Manual testing | `tilt up; curl http://api.repro.localhost` | Test endpoints directly |

