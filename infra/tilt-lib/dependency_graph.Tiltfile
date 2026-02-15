def compute_all_dependencies(project_id, root_path):
  result = local(
    'moon project-graph %s --json' % project_id,
    quiet=True,
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

def dependency_watch_paths(project_id, root_path):
  deps = compute_all_dependencies(project_id, root_path)

  paths = []
  for dep in deps:
    source = dep['source']
    paths.append(os.path.join(root_path, source, 'package.json'))
    paths.append(os.path.join(root_path, source, 'tsconfig.json'))

  return paths

def dependency_sync_paths(project_id, root_path):
  deps = compute_all_dependencies(project_id, root_path)

  paths = []
  for dep in deps:
    paths.append(os.path.join(root_path, dep['source']))

  return paths
