import { ASTNodeType } from './ASTTypes'
import { createASTWalker } from './createASTWalker'
import { Module, Program } from './types'

export function topologicalSort(program: Program): Program {
  // Set of target dependencies for each source module
  const sourceToTargets: Record<string, Set<string>> = {}

  // Set of source modules for each target dependency
  const targetToSources: Record<string, Set<string>> = {}

  // Add bidi edges to the graph
  function addEdge(source: string, target: string) {
    const targetEdges = sourceToTargets[source] || new Set<string>()
    targetEdges.add(target)
    sourceToTargets[source] = targetEdges

    const sourceEdges = targetToSources[target] || new Set<string>()
    sourceEdges.add(source)
    targetToSources[target] = sourceEdges
  }

  // Remove bidi edges from the graph
  function removeEdge(source: string, target: string) {
    const targetEdges = sourceToTargets[source]

    if (targetEdges) {
      targetEdges.delete(target)
    }

    const sourceEdges = targetToSources[target]

    if (sourceEdges) {
      sourceEdges.delete(source)
    }
  }

  for (const module of program) {
    const walkAST = createASTWalker()

    walkAST.accept({
      [ASTNodeType.ImportDeclaration]: node => {
        addEdge(module.name, node.module)
      },
    })

    walkAST(module.ast)
  }

  const sorted: Program = []

  const queue = program.filter(module => {
    const sourceEdges = targetToSources[module.name]
    return !sourceEdges || sourceEdges.size === 0
  })

  const moduleMap = Object.fromEntries(
    program.map(module => [module.name, module])
  )

  let source: Module | undefined

  while ((source = queue.shift())) {
    sorted.unshift(source)

    const targetEdges = sourceToTargets[source.name]

    if (targetEdges) {
      for (const target of targetEdges) {
        removeEdge(source.name, target)

        const sourceEdges = targetToSources[target]

        if (!sourceEdges || sourceEdges.size === 0) {
          const module = moduleMap[target]

          if (module) {
            queue.push(module)
          }
        }
      }
    }
  }

  if (sorted.length !== program.length) {
    // TODO: throw validation error with import declaration interval
    throw new Error('Circular dependency detected')
  }

  return sorted
}
