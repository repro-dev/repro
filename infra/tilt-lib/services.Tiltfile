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


def register_service(service_name, svc, wt_slug, source_path, infra_dir):
  """Register a single service from a worktree source tree.

  Creates Docker builds, Helm deployments, and k8s resources using the
  provided service descriptor, pointing at the given source tree.

  Args:
    service_name: Service key (e.g. 'api-server', 'workspace').
    svc: Service descriptor dict from services.json.
    wt_slug: Worktree slug for namespacing (e.g. 'feat-new-api').
    source_path: Absolute path to the source tree (worktree root).
    infra_dir: Absolute path to the infra/ directory.
  """
  prefix = service_name + '-wt-' + wt_slug
  label = 'wt.' + wt_slug
  moon_project = svc['moon_project']
  app_dir = svc['app_dir']
  chart_path = os.path.join(infra_dir, svc['chart'])

  app_host = 'app.wt-' + wt_slug + '.repro.localhost'
  api_host = 'api.wt-' + wt_slug + '.repro.localhost'

  ignore = COMMON_IGNORE + non_dependency_ignore_patterns(moon_project, source_path, source_path) + COMMON_IGNORE_GLOBS

  if svc['migrations']:
    migrations_image = prefix + '-migrations'

    docker_build(
      migrations_image,
      source_path,
      dockerfile=os.path.join(source_path, 'infra/Dockerfile'),
      target=svc['docker_target'],
      build_args={
        'MOON_SCAFFOLD_PROJECTS': moon_project,
      },
      ignore=ignore,
    )

  docker_build(
    prefix,
    source_path,
    dockerfile=os.path.join(source_path, 'infra/Dockerfile'),
    target=svc['docker_target'],
    build_args={
      'MOON_SCAFFOLD_PROJECTS': moon_project,
    },
    entrypoint=['moon', 'run', moon_project + ':dev'],
    ignore=ignore,
    live_update=[
      fall_back_on([
        os.path.join(source_path, app_dir, 'package.json'),
        os.path.join(source_path, app_dir, 'moon.yml'),
        os.path.join(source_path, app_dir, 'tsconfig.json'),
      ] + dependency_watch_paths(moon_project, source_path, source_path) + [
        os.path.join(source_path, 'pnpm-lock.yaml'),
      ]),
      sync(
        os.path.join(source_path, app_dir, 'src'),
        '/app/' + app_dir + '/src'
      ),
    ] + [
      sync(path, '/app/' + path.removeprefix(source_path + '/'))
      for path in dependency_sync_paths(moon_project, source_path, source_path)
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

  resource_deps = [prefix + '-migrations'] if svc.get('migrations') else []

  k8s_resource(
    prefix + '-deployment',
    new_name=prefix,
    links=[
      'http://' + api_host if 'apiRoutes' in svc.get('ingress', {}) else 'http://' + app_host,
    ],
    resource_deps=resource_deps,
    labels=[label]
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


def register_ingress(wt_slug, service_names, services, infra_dir):
  """Register a per-worktree gateway with ingress routes.

  For each requested service, the ingress route points to the worktree's
  service. For services NOT requested, routes fall back to the main
  checkout's service names (e.g. api-server-service, workspace-service).

  Args:
    wt_slug: Worktree slug.
    service_names: List of service names being isolated in this worktree.
    services: dict of service descriptors keyed by name.
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
  for svc_name in service_names:
    svc = services.get(svc_name, {})
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
