const { execSync, spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

const projectId = 'repro/api-server'
const rootPath = path.resolve(__dirname, '..', '..', '..')

function resolveGraphNode(graph, node) {
  if (typeof node === 'number' || typeof node === 'string') {
    return graph?.data?.[String(node)]
  }

  return node
}

function getProjectId(node) {
  return node?.id || node?.config?.id
}

function collectDependencyWatchPaths(
  graph,
  { projectId, rootPath, existsSync = fs.existsSync }
) {
  const nodes = graph?.graph?.nodes ?? []
  const watchPaths = new Set(['src'])

  for (const rawNode of nodes) {
    const node = resolveGraphNode(graph, rawNode)
    const nodeId = getProjectId(node)
    if (!nodeId || nodeId === projectId) continue
    const source = node.source
    if (!source) continue
    const depRoot = path.join(rootPath, source)
    const depSrc = path.join(depRoot, 'src')
    watchPaths.add(existsSync(depSrc) ? depSrc : depRoot)
  }

  return [...watchPaths]
}

function buildWatchArgs(watchPaths) {
  const args = ['exec', 'tsx', 'watch', 'src/index.ts']

  for (const watchPath of watchPaths) {
    if (watchPath === 'src') {
      continue
    }
    args.push('--include', watchPath)
  }

  args.push('--exclude', 'src/**/*.test.ts')

  return args
}

function readProjectGraph(targetProjectId) {
  const rawGraph = execSync(`moon project-graph ${targetProjectId} --json`, {
    encoding: 'utf8',
  })
  return JSON.parse(rawGraph)
}

function main() {
  const graph = readProjectGraph(projectId)
  const watchPaths = collectDependencyWatchPaths(graph, { projectId, rootPath })
  const args = buildWatchArgs(watchPaths)
  const child = spawn('pnpm', args, { stdio: 'inherit' })

  ;['SIGINT', 'SIGTERM'].forEach(signal => {
    process.on(signal, () => child.kill(signal))
  })

  child.on('exit', code => {
    process.exit(code ?? 1)
  })
}

if (require.main === module) {
  main()
}

module.exports = {
  buildWatchArgs,
  collectDependencyWatchPaths,
  readProjectGraph,
  resolveGraphNode,
}
