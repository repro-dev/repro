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
    if not node_id or node_id == project_id:
      continue
    deps.append(node_id)

  return deps

def dependency_watch_paths(project_id, root_path):
  deps = compute_all_dependencies(project_id, root_path)

  paths = []
  for dep in deps:
    if dep.startswith('repro/'):
      name = dep.replace('repro/', '', 1)
      paths.append(os.path.join(root_path, 'packages', name, 'package.json'))
      paths.append(os.path.join(root_path, 'packages', name, 'tsconfig.json'))
    else:
      paths.append(os.path.join(root_path, 'packages', dep, 'package.json'))
      paths.append(os.path.join(root_path, 'packages', dep, 'tsconfig.json'))

  return paths

def dependency_sync_paths(project_id, root_path):
  deps = compute_all_dependencies(project_id, root_path)

  paths = []
  for dep in deps:
    if dep.startswith('repro/'):
      name = dep.replace('repro/', '', 1)
      paths.append(os.path.join(root_path, 'packages', name))
    else:
      paths.append(os.path.join(root_path, 'packages', dep))

  return paths
