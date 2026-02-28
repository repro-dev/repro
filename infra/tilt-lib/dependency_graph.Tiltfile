def compute_all_dependencies(project_id, root_path, work_dir=None):
  result = local(
    'moon project-graph %s --json' % project_id,
    quiet=True,
    dir=work_dir,
  )

  graph = decode_json(str(result))
  nodes = graph.get('graph', {}).get('nodes', [])

  deps = []
  for node in nodes:
    node_id = node.get('id') or node.get('config', {}).get('id', '')
    source = node.get('source', '')
    if not node_id or node_id == project_id or not source:
      continue
    deps.append({'id': node_id, 'source': source})

  return deps

def dependency_watch_paths(project_id, root_path, work_dir=None):
  deps = compute_all_dependencies(project_id, root_path, work_dir)

  paths = []
  for dep in deps:
    source = dep['source']
    paths.append(os.path.join(root_path, source, 'package.json'))
    paths.append(os.path.join(root_path, source, 'tsconfig.json'))

  return paths

def dependency_sync_paths(project_id, root_path, work_dir=None):
  deps = compute_all_dependencies(project_id, root_path, work_dir)

  paths = []
  for dep in deps:
    paths.append(os.path.join(root_path, dep['source']))

  return paths

def non_dependency_ignore_patterns(project_id, root_path, work_dir=None):
  deps = compute_all_dependencies(project_id, root_path, work_dir)

  keep = {}
  for dep in deps:
    keep[dep['source']] = True

  result = local(
    'moon query projects --json',
    quiet=True,
    dir=work_dir,
  )
  all_projects = decode_json(str(result))

  own_source = ''
  for project in all_projects.get('projects', []):
    if project.get('id', '') == project_id:
      own_source = project.get('source', '')
      break

  if own_source:
    keep[own_source] = True

  patterns = []
  for project in all_projects.get('projects', []):
    source = project.get('source', '')
    if source and source not in keep:
      patterns.append(source + '/**')

  return patterns
