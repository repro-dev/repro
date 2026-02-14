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
const deps = nodes
  .map(node => node.id || node.config?.id)
  .filter(Boolean)
  .filter(id => id !== projectId)

const watchPaths = new Set(['src'])

for (const dep of deps) {
  const name = dep.startsWith('repro/') ? dep.slice('repro/'.length) : dep
  const depRoot = path.join(rootPath, 'packages', name)
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

child.on('exit', code => {
  process.exit(code ?? 1)
})
