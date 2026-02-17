const { execSync, spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

const projectId = 'repro/api-server'
const rootPath = path.resolve(__dirname, '..', '..', '..')
const rawGraph = execSync(`moon project-graph ${projectId} --json`, {
  encoding: 'utf8',
})
const graph = JSON.parse(rawGraph)
const nodes = graph?.graph?.nodes ?? []
const watchPaths = new Set(['src'])

for (const node of nodes) {
  const nodeId = node.id || node.config?.id
  if (!nodeId || nodeId === projectId) continue
  const source = node.source
  if (!source) continue
  const depRoot = path.join(rootPath, source)
  const depSrc = path.join(depRoot, 'src')
  watchPaths.add(fs.existsSync(depSrc) ? depSrc : depRoot)
}

const args = ['exec', 'tsx', 'watch', 'src/index.ts']

for (const watchPath of watchPaths) {
  if (watchPath === 'src') {
    continue
  }
  args.push('--include', watchPath)
}

args.push('--exclude', 'src/**/*.test.ts')

const child = spawn('pnpm', args, { stdio: 'inherit' })

;['SIGINT', 'SIGTERM'].forEach(signal => {
  process.on(signal, () => child.kill(signal))
})

child.on('exit', code => {
  process.exit(code ?? 1)
})
