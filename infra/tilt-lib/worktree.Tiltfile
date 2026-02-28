load('./dependency_graph.Tiltfile', 'dependency_sync_paths', 'dependency_watch_paths', 'non_dependency_ignore_patterns')

COMMON_IGNORE = [
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

def _register_worktree_api_server(wt_slug, wt_path, infra_dir):
  prefix = 'api-server-wt-' + wt_slug
  migrations_image = prefix + '-migrations'
  label = 'wt:' + wt_slug
  moon_project = 'repro/api-server'

  docker_build(
    migrations_image,
    wt_path,
    dockerfile=os.path.join(wt_path, 'infra/Dockerfile'),
    target='api-server',
    build_args={
      'MOON_SCAFFOLD_PROJECTS': moon_project,
    },
    ignore=COMMON_IGNORE + non_dependency_ignore_patterns(moon_project, wt_path, wt_path) + COMMON_IGNORE_GLOBS,
  )

  docker_build(
    prefix,
    wt_path,
    dockerfile=os.path.join(wt_path, 'infra/Dockerfile'),
    target='api-server',
    build_args={
      'MOON_SCAFFOLD_PROJECTS': moon_project,
    },
    entrypoint=['moon', 'run', 'repro/api-server:dev'],
    ignore=COMMON_IGNORE + non_dependency_ignore_patterns(moon_project, wt_path, wt_path) + COMMON_IGNORE_GLOBS,
    live_update=[
      fall_back_on([
        os.path.join(wt_path, 'apps/api-server/package.json'),
        os.path.join(wt_path, 'apps/api-server/moon.yml'),
        os.path.join(wt_path, 'apps/api-server/tsconfig.json'),
      ] + dependency_watch_paths(moon_project, wt_path, wt_path) + [
        os.path.join(wt_path, 'pnpm-lock.yaml'),
      ]),
      sync(
        os.path.join(wt_path, 'apps/api-server/src'),
        '/app/apps/api-server/src'
      ),
    ] + [
      sync(path, '/app/' + path.removeprefix(wt_path + '/'))
      for path in dependency_sync_paths(moon_project, wt_path, wt_path)
    ]
  )

  app_host = 'app.wt-' + wt_slug + '.repro.localhost'
  api_host = 'api.wt-' + wt_slug + '.repro.localhost'

  k8s_yaml(helm(
    os.path.join(infra_dir, 'apps/api-server/chart'),
    name=prefix,
    set=[
      'container.image=' + prefix,
      'migrations.image=' + migrations_image,
      'vars.REPRO_APP_URL=http://' + app_host,
      'vars.REPRO_API_URL=http://' + api_host,
      'vars.PORT=8080',
      'vars.STORAGE_ENDPOINT=http://storage-seaweedfs-s3:8333',
      'vars.OPENROUTER_API_KEY=' + os.getenv('OPENROUTER_API_KEY', ''),
    ]
  ))

  k8s_resource(
    prefix + '-migrations',
    resource_deps=['database-ready', 'storage-ready'],
    labels=[label]
  )

  k8s_resource(
    prefix + '-deployment',
    new_name=prefix,
    links=[
      'http://' + api_host,
    ],
    resource_deps=[prefix + '-migrations'],
    labels=[label]
  )


def _register_worktree_workspace(wt_slug, wt_path, infra_dir):
  prefix = 'workspace-wt-' + wt_slug
  label = 'wt:' + wt_slug
  moon_project = 'repro/workspace'

  docker_build(
    prefix,
    wt_path,
    dockerfile=os.path.join(wt_path, 'infra/Dockerfile'),
    target='workspace',
    build_args={
      'MOON_SCAFFOLD_PROJECTS': moon_project,
    },
    entrypoint=['moon', 'run', 'repro/workspace:dev'],
    ignore=COMMON_IGNORE + non_dependency_ignore_patterns(moon_project, wt_path, wt_path) + COMMON_IGNORE_GLOBS,
    live_update=[
      fall_back_on([
        os.path.join(wt_path, 'apps/workspace/package.json'),
        os.path.join(wt_path, 'apps/workspace/moon.yml'),
        os.path.join(wt_path, 'apps/workspace/tsconfig.json'),
      ] + dependency_watch_paths(moon_project, wt_path, wt_path) + [
        os.path.join(wt_path, 'pnpm-lock.yaml'),
      ]),
      sync(
        os.path.join(wt_path, 'apps/workspace/src'),
        '/app/apps/workspace/src'
      ),
    ] + [
      sync(path, '/app/' + path.removeprefix(wt_path + '/'))
      for path in dependency_sync_paths(moon_project, wt_path, wt_path)
    ]
  )

  app_host = 'app.wt-' + wt_slug + '.repro.localhost'
  api_host = 'api.wt-' + wt_slug + '.repro.localhost'

  k8s_yaml(helm(
    os.path.join(infra_dir, 'apps/workspace/chart'),
    name=prefix,
    set=[
      'container.image=' + prefix,
      'vars.REPRO_APP_URL=http://' + app_host,
      'vars.REPRO_API_URL=http://' + api_host,
      'vars.PORT=8080',
    ]
  ))

  k8s_resource(
    prefix + '-deployment',
    new_name=prefix,
    links=[
      'http://' + app_host,
    ],
    labels=[label]
  )


def _register_worktree_ingress(wt_slug, services, infra_dir):
  app_host = 'app.wt-' + wt_slug + '.repro.localhost'
  api_host = 'api.wt-' + wt_slug + '.repro.localhost'
  label = 'wt:' + wt_slug

  api_service = 'api-server-wt-' + wt_slug + '-service' if 'api-server' in services else 'api-server-service'
  workspace_service = 'workspace-wt-' + wt_slug + '-service' if 'workspace' in services else 'workspace-service'

  k8s_yaml(helm(
    os.path.join(infra_dir, 'apps/gateway/chart'),
    name='gateway-wt-' + wt_slug,
    set=[
      'ingress.appRoutes.host=' + app_host,
      'ingress.appRoutes.paths[0].serviceName=' + workspace_service,
      'ingress.apiRoutes.host=' + api_host,
      'ingress.apiRoutes.paths[0].serviceName=' + api_service,
      'ingress.adminRoutes.host=admin.wt-' + wt_slug + '.repro.localhost',
      'ingress.adminRoutes.paths[0].serviceName=admin-service',
    ]
  ))

  ingress_objects = [
    'gateway-wt-%s-ingress-app:Ingress:default' % wt_slug,
    'gateway-wt-%s-ingress-api:Ingress:default' % wt_slug,
    'gateway-wt-%s-ingress-admin:Ingress:default' % wt_slug,
  ]

  k8s_resource(
    new_name='gateway-ingress-wt-' + wt_slug,
    objects=ingress_objects,
    resource_deps=['ingress-admission-ready'],
    labels=[label]
  )


def _register_worktree_dependencies(wt_slug, wt_path):
  label = 'wt:' + wt_slug

  local_resource(
    'dependencies-wt-' + wt_slug,
    cmd='pnpm fetch && pnpm install --offline',
    dir=wt_path,
    deps=[os.path.join(wt_path, 'pnpm-lock.yaml')],
    labels=[label],
  )


def register_worktree(wt_slug, wt_path, services, infra_dir):
  """Register all Tilt resources for a worktree.

  Creates isolated service instances (Docker builds, Helm deployments, and
  ingress routes) for the specified services, using the worktree's source
  tree as the build context. Shared infrastructure (database, storage,
  ingress controller) comes from the main checkout.

  Args:
    wt_slug: Short slug for the worktree (e.g. "feat-new-api"), matching
             the directory name repro-wt-<slug>.
    wt_path: Absolute path to the worktree root directory.
    services: List of service names to isolate (e.g. ["api-server", "workspace"]).
              Services not listed will be shared from the main checkout.
    infra_dir: Absolute path to the main checkout's infra/ directory, used
               to locate Helm charts.
  """
  _register_worktree_dependencies(wt_slug, wt_path)

  for service in services:
    if service == 'api-server':
      _register_worktree_api_server(wt_slug, wt_path, infra_dir)
    elif service == 'workspace':
      _register_worktree_workspace(wt_slug, wt_path, infra_dir)
    else:
      fail('Unknown worktree service: %s (worktree: %s)' % (service, wt_slug))

  _register_worktree_ingress(wt_slug, services, infra_dir)
