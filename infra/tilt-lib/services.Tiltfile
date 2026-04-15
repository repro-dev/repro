
def _hash_suffix(s):
  """Return the first 6 hex chars of a deterministic hash of s.

  Starlark has no hashlib; a simple polynomial hash is sufficient
  for collision avoidance among a handful of worktree slugs.
  """
  h = 0
  for c in s.elems():
    h = (h * 31 + ord(c)) & 0xFFFFFFFF
  return '%x' % h


def _slug_port_offset(slug):
  """Return a deterministic port offset (1-999) for a worktree slug."""
  h = 0
  for c in slug.elems():
    h = (h * 31 + ord(c)) & 0xFFFFFFFF
  return (h % 999) + 1


def _dns_slug(slug):
  """Truncate a worktree slug so it fits in a single DNS label (≤63 chars).

  The slug is embedded as a DNS label component (e.g. 'wt-<slug>' inside a
  hostname), so the slug itself must be short enough that the full label stays
  within the 63-character DNS limit.  After truncation, strip any trailing
  '-', '_', or '.' so the label ends on an alphanumeric character.
  """
  if len(slug) > 63:
    slug = slug[:63].rstrip('-_.')
  return slug


def wt_label(slug):
  """Build a Tilt label for a worktree slug, truncated to 63 chars.

  Kubernetes label values must be ≤63 chars and end with an alphanumeric
  character. After truncation, strip any trailing '-', '_', or '.' that
  would fail the label regex.
  """
  label = 'wt.' + slug
  if len(label) > 63:
    label = label[:63].rstrip('-_.')
  return label


def wt_name(base, slug, max_len=49):
  """Build a length-safe name from a base and worktree slug.

  Constructs 'base-wt-slug' and truncates the slug (with a hash
  suffix for collision avoidance) when the result exceeds max_len.
  The default max_len of 49 ensures that Helm release names plus the
  longest chart suffix (-ingress-admin, 14 chars) stay within the
  63-byte Kubernetes label value limit.

  Args:
    base: Prefix (e.g. 'workspace', 'gateway').
    slug: Worktree slug (e.g. 'gary-rep-237-some-long-name').
    max_len: Maximum total length (default 49).

  Returns:
    A string of at most max_len characters.
  """
  full = base + '-wt-' + slug
  if len(full) <= max_len:
    return full

  # Reserve 7 chars for the hash suffix (-HHHHHH)
  hash_suffix = _hash_suffix(slug)[:6]
  budget = max_len - len(base) - len('-wt-') - 1 - 6  # 1 for '-', 6 for hash
  if budget < 1:
    budget = 1
  return base + '-wt-' + slug[:budget] + '-' + hash_suffix


COMMON_IGNORE = [
  '.git',
  'infra',
  'dist',
  'build',
  'node_modules',
]

COMMON_IGNORE_GLOBS = [
  '**/*.test.ts',
  '**/*.test.tsx',
  '**/*.spec.ts',
  '**/*.spec.tsx',
  '**/fixtures/**',
  '**/mocks/**',
  '**/test-data/**',
  '**/*.stories.tsx',
  '**/*.stories.ts',
  '**/*.demo.tsx',
  '**/*.md',
  '*.md',
  '*.MD',
  '.DS_Store',
  '*.swp',
  '*.swo',
  '*~',
  '*.log',
]


LOCAL_SERVICE_WATCH_IGNORE_GLOBS = [
  '**/.git/**',
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/storybook-static/**',
  '**/coverage/**',
  '**/tmp/**',
  '.DS_Store',
  '*.swp',
  '*.swo',
  '*~',
  '*.log',
]


def _dedupe_paths(paths):
  deduped = []
  seen = {}

  for path in paths:
    if path and path not in seen:
      deduped.append(path)
      seen[path] = True

  return deduped


def service_watch_paths(svc, root_path):
  # Services run dev servers (Vite, webpack, etc.) that handle their own file
  # watching and hot reload. Tilt only needs to restart a service when its
  # dependency manifest changes — not on every source file edit.
  #
  # Watching broad source trees here caused an infinite restart loop: moon
  # build tasks regenerate files inside watched dirs on every startup, which
  # Tilt interprets as a change and restarts again. (REP-873 tracks the
  # long-term fix of moving codegen outputs out of src/.)
  paths = []

  # pnpm-lock.yaml is the aggregate signal for any dependency change.
  paths.append(os.path.join(root_path, 'pnpm-lock.yaml'))

  # The service's own package.json signals script or direct-dep changes.
  app_dir = svc.get('app_dir', '')
  if app_dir:
    paths.append(os.path.join(root_path, app_dir, 'package.json'))

  return _dedupe_paths(paths)


def service_watch_ignores(svc, root_path):
  return list(LOCAL_SERVICE_WATCH_IGNORE_GLOBS)


def wt_db_name(slug):
  """Derive a Postgres-safe database name for a worktree slug.

  Replaces hyphens with underscores so the name is a valid unquoted
  Postgres identifier: 'repro_wt_<slug>'.
  """
  return 'repro_wt_' + slug.replace('-', '_')


def _service_host(portless_name, slug):
  """Build a hostname for a service given its portless base name and slug.

  Returns the .localhost:1355 hostname, with worktree prefix when slug
  is non-empty.
  """
  if slug:
    parts = portless_name.split('.')
    dns = _dns_slug(slug)
    if len(parts) >= 2 and parts[-1] == 'repro':
      return '.'.join(parts[:-1]) + '.wt-' + dns + '.repro.localhost:1355'
    return portless_name + '.wt-' + dns + '.localhost:1355'
  return portless_name + '.localhost:1355'


def register_service(service_name, svc, wt_slug, source_path, infra_dir, service_slugs=None):
  if not service_slugs:
    service_slugs = {}

  prefix = wt_name(service_name, wt_slug)
  label = wt_label(wt_slug)
  moon_project = svc['moon_project']

  portless_base = svc.get('portless_name', service_name + '.repro')
  parts = portless_base.split('.')
  dns = _dns_slug(wt_slug)
  if len(parts) >= 2 and parts[-1] == 'repro':
    portless_wt_name = '.'.join(parts[:-1]) + '.wt-' + dns + '.repro'
  else:
    portless_wt_name = portless_base + '.wt-' + dns

  app_slug = service_slugs.get('workspace', '')
  api_slug = service_slugs.get('api-server', '')
  app_host = _service_host('app.repro', app_slug)
  api_host = _service_host('api.repro', api_slug)

  serve_env = dict(svc.get('serve_env', {}))
  serve_env['REPRO_APP_URL'] = 'https://' + app_host
  serve_env['REPRO_API_URL'] = 'https://' + api_host

  for env_key in svc.get('env_passthrough', []):
    serve_env[env_key] = os.getenv(env_key, '')

  db_name = wt_db_name(wt_slug)

  if svc.get('migrations'):
    db_ready_name = 'db-ready-wt-' + wt_slug
    local_resource(
      db_ready_name,
      cmd="PGPASSWORD=repro psql -h localhost -p 15432 -U repro -d postgres -tc \"SELECT 1 FROM pg_database WHERE datname = '%s'\" | grep -q 1 || PGPASSWORD=repro psql -h localhost -p 15432 -U repro -d postgres -c \"CREATE DATABASE %s\"" % (db_name, db_name),
      resource_deps=['database-ready'],
      labels=[label],
    )

    migrations_resource = prefix + '-migrations'
    migration_env = dict(serve_env)
    migration_env['DB_NAME'] = db_name
    local_resource(
      migrations_resource,
      cmd='moon run ' + svc['migrations']['moon_task'],
      dir=source_path,
      env=migration_env,
      resource_deps=[db_ready_name] + svc['migrations']['resource_deps'],
      labels=[label],
    )

    if svc.get('seed'):
      seed_pkg = svc['seed']['pnpm_package']
      seed_deps = svc['seed'].get('resource_deps', [])
      seed_env = {'DB_NAME': db_name}

      local_resource(
        'db-seed-wt-' + wt_slug,
        cmd='pnpm --filter %s run seed' % seed_pkg,
        dir=source_path,
        env=seed_env,
        resource_deps=[migrations_resource] + seed_deps,
        labels=[label],
      )

      local_resource(
        'db-reset-wt-' + wt_slug,
        cmd='pnpm --filter %s run reset-db' % seed_pkg,
        dir=source_path,
        env=seed_env,
        resource_deps=['database-ready'] + seed_deps,
        labels=[label],
        trigger_mode=TRIGGER_MODE_MANUAL,
        auto_init=False,
      )

  serve_env_final = dict(serve_env)
  if svc.get('migrations'):
    serve_env_final['DB_NAME'] = db_name

  resource_deps_list = [prefix + '-migrations'] if svc.get('migrations') else []
  resource_deps_list.append('portless-proxy')
  wt_dep_name = 'dependencies-wt-' + wt_slug
  resource_deps_list.append(wt_dep_name)

  local_resource(
    prefix,
    serve_cmd='portless %s moon run %s:dev' % (portless_wt_name, moon_project),
    serve_dir=source_path,
    serve_env=serve_env_final,
    deps=service_watch_paths(svc, source_path),
    ignore=service_watch_ignores(svc, source_path),
    resource_deps=resource_deps_list,
    allow_parallel=True,
    links=['https://' + _service_host(portless_base, wt_slug)],
    labels=[label],
  )


def register_local_service(service_name, svc, infra_dir, wt_slug=None, source_path=None, service_slugs=None):
  if not service_slugs:
    service_slugs = {}

  if wt_slug:
    resource_name = wt_name(service_name, wt_slug)
    label = wt_label(wt_slug)
    work_dir = source_path
  else:
    resource_name = service_name
    label = svc.get('labels', ['service'])[0] if svc.get('labels') else 'service'
    work_dir = os.path.join(infra_dir, '..')

  serve_env = dict(svc.get('serve_env', {}))

  if wt_slug:
    app_slug = service_slugs.get('workspace', '')
    api_slug = service_slugs.get('api-server', '')
    serve_env['REPRO_APP_URL'] = 'https://' + _service_host('app.repro', app_slug)
    serve_env['REPRO_API_URL'] = 'https://' + _service_host('api.repro', api_slug)

  resource_deps = list(svc.get('resource_deps', []))
  if wt_slug and 'dependencies' in resource_deps:
    idx = resource_deps.index('dependencies')
    resource_deps[idx] = 'dependencies-wt-' + wt_slug

  labels = list(svc.get('labels', []))
  if wt_slug:
    labels = [label]

  base_port = svc.get('port', 0)
  links = []

  if base_port:
    port = base_port
    if wt_slug:
      port = base_port + _slug_port_offset(wt_slug)
    serve_env['PORT'] = str(port)
    links = ['http://localhost:' + str(port)]

  local_resource(
    resource_name,
    serve_cmd=svc['serve_cmd'],
    serve_dir=work_dir,
    serve_env=serve_env,
    dir=work_dir,
    deps=service_watch_paths(svc, work_dir),
    ignore=service_watch_ignores(svc, work_dir),
    resource_deps=resource_deps,
    allow_parallel=True,
    links=links,
    labels=labels,
  )


def resolve_dependencies(service_config, services):
  """Expand transitive service dependencies in the config list.

  For each service in the config, look up its `deps` in the services
  dict and inject any missing dependencies as main-checkout entries
  (slug="", source="."). Only services that are NOT already present
  get added — if the user explicitly listed a dependency it keeps its
  original source/slug.

  Args:
    service_config: list of dicts [{name, source, slug}, ...]
    services: dict of service descriptors keyed by name.

  Returns:
    New list with dependency entries appended as needed.
  """
  present = {}
  for entry in service_config:
    key = entry.get('name', '') + ':' + entry.get('slug', '')
    present[key] = True

  result = list(service_config)
  queue = list(service_config)

  for _guard in range(100):
    if not queue:
      break
    entry = queue[0]
    queue = queue[1:]

    name = entry.get('name', '')
    svc = services.get(name, {})
    deps = svc.get('deps', [])

    for dep_name in deps:
      main_key = dep_name + ':'
      has_any = False
      for existing_key in present:
        if existing_key.startswith(dep_name + ':'):
          has_any = True
          break

      if not has_any:
        dep_entry = {'name': dep_name, 'source': '.', 'slug': ''}
        result.append(dep_entry)
        present[main_key] = True
        queue.append(dep_entry)

  return result


