
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


def wt_portless_name(slug):
  """Return a short, stable DNS-safe identifier for a worktree slug.

  When the slug is short enough to fit as a DNS label on its own (≤60 chars,
  leaving room for the 'wt-' prefix), return it unchanged.

  When the slug is too long, derive a short form from the Linear issue number
  embedded in the slug (expected pattern: '...-rep-NNN-...' or starts with
  'rep-NNN-...'), combined with a 4-char hash of the full slug for uniqueness:

    rep-473-a3f2

  If no issue number is found, fall back to a 4-char hash of the full slug:

    a3f2

  The returned string is always ≤60 chars so that 'wt-' + result ≤ 63 chars.
  """
  MAX = 60  # 63 - len('wt-')

  # Normalize: DNS labels allow only [a-z0-9-]; replace . and _ with -,
  # then strip any leading/trailing hyphens produced by the replacement.
  slug = slug.replace('.', '-').replace('_', '-').strip('-')
  if not slug:
    slug = 'wt'

  if len(slug) <= MAX:
    return slug

  # Extract 'rep-NNN' from anywhere in the slug.
  # Starlark has no regex; scan for 'rep-' followed by digits manually.
  issue_part = ''
  idx = slug.find('rep-')
  while idx != -1:
    # Collect digits after 'rep-'
    start = idx + len('rep-')
    end = start
    for ch in slug[start:].elems():
      if ch >= '0' and ch <= '9':
        end += 1
      else:
        break
    if end > start:  # found at least one digit
      issue_part = 'rep-' + slug[start:end]
      break
    idx = slug.find('rep-', idx + 1)

  # Pad to at least 4 hex chars so the suffix is always fixed-width.
  raw = _hash_suffix(slug)
  h = ('0000' + raw)[-4:]
  if issue_part:
    return issue_part + '-' + h
  return h


def wt_label(slug):
  """Build a Tilt label for a worktree slug.

  Uses wt_portless_name() to produce a DNS-safe short form when needed,
  then prepends 'wt.' — the result is always a valid Kubernetes label value
  (≤63 chars, ending on an alphanumeric character).
  """
  return ('wt.' + wt_portless_name(slug)).rstrip('-_.')


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
  # Watching broad source trees here caused restart loops when build tasks
  # regenerated files during startup.
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
    dns = wt_portless_name(slug)
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
  dns = wt_portless_name(wt_slug)
  if len(parts) >= 2 and parts[-1] == 'repro':
    portless_wt_name = '.'.join(parts[:-1]) + '.wt-' + dns + '.repro'
  else:
    portless_wt_name = portless_base + '.wt-' + dns

  # Scope dependency URLs to the current worktree so identical service names in
  # other worktrees cannot overwrite the URLs this service should use.
  current_service_slugs = service_slugs.get(wt_slug, {})
  app_slug = current_service_slugs.get('workspace', wt_slug)
  api_slug = current_service_slugs.get('api-server', wt_slug)
  admin_slug = current_service_slugs.get('admin', wt_slug)
  marketing_slug = current_service_slugs.get('marketing', wt_slug)
  app_host = _service_host('app.repro', app_slug)
  api_host = _service_host('api.repro', api_slug)
  admin_host = _service_host('admin.repro', admin_slug)
  marketing_host = _service_host('marketing.repro', marketing_slug)

  serve_env = dict(svc.get('serve_env', {}))
  serve_env['REPRO_APP_URL'] = 'https://' + app_host
  serve_env['REPRO_API_URL'] = 'https://' + api_host
  serve_env['REPRO_ADMIN_URL'] = 'https://' + admin_host
  serve_env['REPRO_MARKETING_URL'] = 'https://' + marketing_host

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
      seed_env = dict(serve_env)
      seed_env['DB_NAME'] = db_name
      seed_env['STORAGE_KEY_PREFIX'] = 'wt-' + wt_slug + '/'

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

  if wt_slug:
    serve_env_final['STORAGE_KEY_PREFIX'] = 'wt-' + wt_slug + '/'

  resource_deps_list = [prefix + '-migrations'] if svc.get('migrations') else []
  if svc.get('seed'):
    resource_deps_list.append('db-seed-wt-' + wt_slug)
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

  # Forward declared host env vars (e.g. TDL_PROFILE for capture) into the
  # service's build/serve environment. Mirrors register_service() and the
  # inline portless path in infra/Tiltfile, which local services otherwise miss.
  for env_key in svc.get('env_passthrough', []):
    serve_env[env_key] = os.getenv(env_key, '')

  if wt_slug:
    current_service_slugs = service_slugs.get(wt_slug, {})
    app_slug = current_service_slugs.get('workspace', wt_slug)
    api_slug = current_service_slugs.get('api-server', wt_slug)
    admin_slug = current_service_slugs.get('admin', wt_slug)
    marketing_slug = current_service_slugs.get('marketing', wt_slug)
    serve_env['REPRO_APP_URL'] = 'https://' + _service_host('app.repro', app_slug)
    serve_env['REPRO_API_URL'] = 'https://' + _service_host('api.repro', api_slug)
    serve_env['REPRO_ADMIN_URL'] = 'https://' + _service_host('admin.repro', admin_slug)
    serve_env['REPRO_MARKETING_URL'] = 'https://' + _service_host('marketing.repro', marketing_slug)

  resource_deps = list(svc.get('resource_deps', []))
  if wt_slug and 'dependencies' in resource_deps:
    idx = resource_deps.index('dependencies')
    resource_deps[idx] = 'dependencies-wt-' + wt_slug

  db_backed_by = svc.get('db_backed_by', '')
  if db_backed_by:
    if wt_slug:
      serve_env['DB_NAME'] = wt_db_name(wt_slug)
      migration_dep = wt_name(db_backed_by, wt_slug) + '-migrations'
    else:
      migration_dep = db_backed_by + '-migrations'

    if migration_dep not in resource_deps:
      resource_deps.append(migration_dep)

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
  dict and inject any missing dependencies using the same source tree
  and worktree slug as the service that depends on them. Only services
  that are NOT already present get added — if the user explicitly
  listed a dependency it keeps its original source/slug.

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
    deps = list(svc.get('deps', []))
    db_backed_by = svc.get('db_backed_by', '')
    if db_backed_by and db_backed_by not in deps:
      deps.append(db_backed_by)

    for dep_name in deps:
      dep_key = dep_name + ':' + entry.get('slug', '')

      if dep_key not in present:
        dep_entry = {
          'name': dep_name,
          'source': entry.get('source', '.'),
          'slug': entry.get('slug', ''),
        }
        result.append(dep_entry)
        present[dep_key] = True
        queue.append(dep_entry)

  return result
