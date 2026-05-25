const assert = require('node:assert/strict')
const test = require('node:test')

const {
  buildWatchArgs,
  collectDependencyWatchPaths,
} = require('./dev-watch.js')

test('collects dependency watch paths from Moon 2.2 graph data nodes', () => {
  const graph = {
    graph: {
      nodes: [0, 1, 2],
    },
    data: {
      0: { id: 'repro/api-server', source: 'apps/api-server' },
      1: { id: 'repro/domain', source: 'packages/domain' },
      2: { id: 'repro/email', source: 'packages/email' },
    },
  }

  const watchPaths = collectDependencyWatchPaths(graph, {
    projectId: 'repro/api-server',
    rootPath: '/repo',
    existsSync: filePath => filePath === '/repo/packages/domain/src',
  })

  assert.deepEqual(watchPaths, [
    'src',
    '/repo/packages/domain/src',
    '/repo/packages/email',
  ])
})

test('builds tsx watch arguments with dependency includes and test excludes', () => {
  assert.deepEqual(
    buildWatchArgs([
      'src',
      '/repo/packages/domain/src',
      '/repo/packages/email',
    ]),
    [
      'exec',
      'tsx',
      'watch',
      'src/index.ts',
      '--include',
      '/repo/packages/domain/src',
      '--include',
      '/repo/packages/email',
      '--exclude',
      'src/**/*.test.ts',
    ]
  )
})
