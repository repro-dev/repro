load('./dependency_graph.Tiltfile', 'dependency_sync_paths', 'dependency_watch_paths', 'non_dependency_ignore_patterns')

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

# Service descriptors
#
# Each deployable service declares the metadata needed for a generic
# worktree registration: moon project id, Dockerfile target, path to
# the Helm chart (relative to infra/), the app directory inside the
# monorepo, and any extra helm --set values.
#
# "migrations" is an optional sub-key for services that run a pre-deploy
# job (only api-server today).
#
# "ingress" maps route keys in the gateway chart to the service name
# suffix used for the k8s Service object (e.g. "apiRoutes" -> "-service").

SERVICES = {
  'api-server': {
    'moon_project': 'repro/api-server',
    'docker_target': 'api-server',
    'chart': 'apps/api-server/chart',
    'app_dir': 'apps/api-server',
    'helm_sets': [
      'vars.PORT=8080',
      'vars.STORAGE_ENDPOINT=http://storage-seaweedfs-s3:8333',
    ],
    'helm_env_sets': {
      'OPENROUTER_API_KEY': 'vars.OPENROUTER_API_KEY',
    },
    'migrations': {
      'moon_task': 'repro/api-server:migrate',
      'resource_deps': ['database-ready', 'storage-ready'],
    },
    'resource_deps_fn': lambda prefix: [prefix + '-migrations'],
    'ingress': {
      'apiRoutes': 'service',
    },
  },

  'workspace': {
    'moon_project': 'repro/workspace',
    'docker_target': 'workspace',
    'chart': 'apps/workspace/chart',
    'app_dir': 'apps/workspace',
    'helm_sets': [
      'vars.PORT=8080',
    ],
    'helm_env_sets': {},
    'migrations': None,
    'resource_deps_fn': lambda prefix: [],
    'ingress': {
      'appRoutes': 'service',
    },
  },
}


def is_worktree(repo_root):
  """Detect whether repo_root is a git worktree (not the main checkout).

  In a worktree, .git is a file containing 'gitdir: <path>' rather than
  a directory. Since Tilt Starlark has no os.path.isdir, we shell out to
  `test -f .git`.
  """
  result = str(local(
    'test -f .git && echo worktree || echo main',
    quiet=True,
    dir=repo_root,
  ))
  return result.strip() == 'worktree'


def detect_main_checkout(repo_root):
  """Resolve the main checkout path from a worktree.

  Parses `git worktree list` output to find the first entry (which is
  always the main checkout).
  """
  result = str(local(
    'git worktree list --porcelain',
    quiet=True,
    dir=repo_root,
  ))

  for line in result.splitlines():
    if line.startswith('worktree '):
      return line.removeprefix('worktree ')

  fail('Could not detect main checkout from git worktree list')


def worktree_slug(repo_root):
  """Derive a short slug from the worktree directory name.

  Given a path like /home/user/repro-wt-feat-new-api, returns 'feat-new-api'.
  Falls back to the full directory basename if it does not match the
  repro-wt-* convention.
  """
  basename = os.path.basename(repo_root)

  if basename.startswith('repro-wt-'):
    return basename.removeprefix('repro-wt-')

  return basename


def register_worktree_dependencies(wt_slug, wt_path):
  """Register a pnpm install resource for the worktree."""
  local_resource(
    'dependencies',
    cmd='pnpm fetch && pnpm install --offline',
    dir=wt_path,
    deps=[os.path.join(wt_path, 'pnpm-lock.yaml')],
    labels=['infra'],
  )


def register_worktree_service(service_name, wt_slug, wt_path, infra_dir):
  """Register a single service from a worktree.

  Uses the service descriptor from SERVICES to create Docker builds,
  Helm deployments, and k8s resources — mirroring what the per-app
  Tiltfiles do, but pointing at the worktree's source tree.

  Args:
    service_name: Key in SERVICES (e.g. 'api-server', 'workspace').
    wt_slug: Worktree slug for namespacing (e.g. 'feat-new-api').
    wt_path: Absolute path to the worktree root directory.
    infra_dir: Absolute path to the infra/ directory (in the worktree
               or main checkout — charts are identical in both).
  """
  if service_name not in SERVICES:
    fail('Unknown service: %s. Known services: %s' % (service_name, ', '.join(SERVICES.keys())))

  svc = SERVICES[service_name]
  prefix = service_name + '-wt-' + wt_slug
  label = 'wt.' + wt_slug
  moon_project = svc['moon_project']
  app_dir = svc['app_dir']
  chart_path = os.path.join(infra_dir, svc['chart'])

  app_host = 'app.wt-' + wt_slug + '.repro.localhost'
  api_host = 'api.wt-' + wt_slug + '.repro.localhost'

  ignore = COMMON_IGNORE + non_dependency_ignore_patterns(moon_project, wt_path, wt_path) + COMMON_IGNORE_GLOBS

  if svc['migrations']:
    migrations_image = prefix + '-migrations'

    docker_build(
      migrations_image,
      wt_path,
      dockerfile=os.path.join(wt_path, 'infra/Dockerfile'),
      target=svc['docker_target'],
      build_args={
        'MOON_SCAFFOLD_PROJECTS': moon_project,
      },
      ignore=ignore,
    )

  docker_build(
    prefix,
    wt_path,
    dockerfile=os.path.join(wt_path, 'infra/Dockerfile'),
    target=svc['docker_target'],
    build_args={
      'MOON_SCAFFOLD_PROJECTS': moon_project,
    },
    entrypoint=['moon', 'run', moon_project + ':dev'],
    ignore=ignore,
    live_update=[
      fall_back_on([
        os.path.join(wt_path, app_dir, 'package.json'),
        os.path.join(wt_path, app_dir, 'moon.yml'),
        os.path.join(wt_path, app_dir, 'tsconfig.json'),
      ] + dependency_watch_paths(moon_project, wt_path, wt_path) + [
        os.path.join(wt_path, 'pnpm-lock.yaml'),
      ]),
      sync(
        os.path.join(wt_path, app_dir, 'src'),
        '/app/' + app_dir + '/src'
      ),
    ] + [
      sync(path, '/app/' + path.removeprefix(wt_path + '/'))
      for path in dependency_sync_paths(moon_project, wt_path, wt_path)
    ]
  )

  helm_set = [
    'container.image=' + prefix,
    'vars.REPRO_APP_URL=http://' + app_host,
    'vars.REPRO_API_URL=http://' + api_host,
  ] + svc['helm_sets']

  if svc['migrations']:
    helm_set.append('migrations.image=' + prefix + '-migrations')

  for env_key, helm_key in svc.get('helm_env_sets', {}).items():
    helm_set.append(helm_key + '=' + os.getenv(env_key, ''))

  k8s_yaml(helm(
    chart_path,
    name=prefix,
    set=helm_set,
  ))

  if svc['migrations']:
    k8s_resource(
      prefix + '-migrations',
      resource_deps=svc['migrations']['resource_deps'],
      labels=[label]
    )

  resource_deps = svc['resource_deps_fn'](prefix)

  k8s_resource(
    prefix + '-deployment',
    new_name=prefix,
    links=[
      'http://' + api_host if 'apiRoutes' in svc.get('ingress', {}) else 'http://' + app_host,
    ],
    resource_deps=resource_deps,
    labels=[label]
  )


def register_worktree_ingress(wt_slug, services, infra_dir):
  """Register a per-worktree gateway with ingress routes.

  For each requested service, the ingress route points to the worktree's
  service. For services NOT requested, routes fall back to the main
  checkout's service names (e.g. api-server-service, workspace-service).

  Note: fallback routes require the main checkout's Tilt to be running
  with those services enabled. If the backing service doesn't exist in
  the cluster, the ingress will have a dangling backend and requests
  will fail with 503.

  Args:
    wt_slug: Worktree slug.
    services: List of service names being isolated in this worktree.
    infra_dir: Absolute path to the infra/ directory.
  """
  app_host = 'app.wt-' + wt_slug + '.repro.localhost'
  api_host = 'api.wt-' + wt_slug + '.repro.localhost'
  label = 'wt.' + wt_slug

  route_defaults = {
    'appRoutes': 'workspace',
    'apiRoutes': 'api-server',
    'adminRoutes': 'admin',
  }

  overrides = {}
  for svc_name in services:
    svc = SERVICES.get(svc_name, {})
    for route_key, suffix in svc.get('ingress', {}).items():
      overrides[route_key] = svc_name + '-wt-' + wt_slug + '-' + suffix

  helm_sets = [
    'ingress.appRoutes.host=' + app_host,
    'ingress.apiRoutes.host=' + api_host,
    'ingress.adminRoutes.host=admin.wt-' + wt_slug + '.repro.localhost',
  ]

  for route_key, default_svc in route_defaults.items():
    service_name = overrides.get(route_key, default_svc + '-service')
    helm_sets.append('ingress.%s.paths[0].path=/(.*)' % route_key)
    helm_sets.append('ingress.%s.paths[0].pathType=ImplementationSpecific' % route_key)
    helm_sets.append('ingress.%s.paths[0].serviceName=%s' % (route_key, service_name))
    helm_sets.append('ingress.%s.paths[0].servicePort=http' % route_key)

  k8s_yaml(helm(
    os.path.join(infra_dir, 'apps/gateway/chart'),
    name='gateway-wt-' + wt_slug,
    set=helm_sets,
  ))

  k8s_resource(
    new_name='gateway-ingress-wt-' + wt_slug,
    objects=[
      'gateway-wt-%s-ingress-app:Ingress:default' % wt_slug,
      'gateway-wt-%s-ingress-api:Ingress:default' % wt_slug,
      'gateway-wt-%s-ingress-admin:Ingress:default' % wt_slug,
    ],
    resource_deps=['ingress-admission-ready'],
    labels=[label]
  )
