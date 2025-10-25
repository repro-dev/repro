import { ASTNodeType, OptionNode, ReferenceNode, TypeNode } from './ASTTypes'
import { createASTWalker } from './createASTWalker'
import { ResolutionError } from './errors'
import { Program } from './types'

function isOptional(
  node: TypeNode | OptionNode | ReferenceNode
): node is OptionNode {
  return node.type === ASTNodeType.Option
}

function unwrapOption(
  node: TypeNode | OptionNode | ReferenceNode
): TypeNode | ReferenceNode {
  return isOptional(node) ? node.value : node
}

function wrapOption(node: TypeNode | ReferenceNode): OptionNode {
  return {
    type: ASTNodeType.Option,
    value: node,
    interval: node.interval,
  }
}

type ModuleName = string
type SymbolName = string

export function resolveReferences(program: Program): Program {
  const programResolvedAssignments = new Map<
    ModuleName,
    Map<SymbolName, TypeNode | OptionNode>
  >()

  for (const module of program) {
    const symbolToModuleMap = new Map<SymbolName, ModuleName>()

    const walkAST = createASTWalker()

    walkAST.accept({
      // Find all imported symbols in scope and map them to their module.
      // This enables us to resolve references to other modules.
      [ASTNodeType.ImportDeclaration]: node => {
        switch (node.importNames.type) {
          case ASTNodeType.SingleNamedImport:
            symbolToModuleMap.set(node.importNames.name, node.module)
            break

          case ASTNodeType.NamedImports:
            for (const symbol of node.importNames.names) {
              symbolToModuleMap.set(symbol, node.module)
            }
            break
        }
      },

      // Resolve references at assignment time. References will resolve transitively.
      // Note: we will unwrap options here, so that we can resolve references.
      [ASTNodeType.Assignment]: node => {
        symbolToModuleMap.set(node.name, module.name)

        let targetValue = unwrapOption(node.value)

        if (targetValue.type === ASTNodeType.Reference) {
          const targetModule = symbolToModuleMap.get(targetValue.name)

          if (targetModule) {
            const targetModuleAssignments =
              programResolvedAssignments.get(targetModule)

            if (targetModuleAssignments) {
              const assignmentValue = targetModuleAssignments.get(
                targetValue.name
              )

              if (assignmentValue) {
                targetValue = isOptional(assignmentValue)
                  ? assignmentValue.value
                  : assignmentValue
              }
            }
          }
        }

        if (targetValue.type === ASTNodeType.Reference) {
          throw new ResolutionError(
            `Could not resolve reference to ${targetValue.name}`,
            targetValue.interval
          )
        }

        const moduleAssignments =
          programResolvedAssignments.get(module.name) ||
          new Map<SymbolName, TypeNode | OptionNode>()

        moduleAssignments.set(
          node.name,
          isOptional(node.value) ? wrapOption(targetValue) : targetValue
        )
        programResolvedAssignments.set(module.name, moduleAssignments)
      },

      [ASTNodeType.Reference]: node => {
        const targetModule = symbolToModuleMap.get(node.name)

        if (!targetModule) {
          throw new ResolutionError(
            `Could not resolve reference to ${node.name}`,
            node.interval
          )
        }

        const targetModuleAssignments =
          programResolvedAssignments.get(targetModule)

        if (!targetModuleAssignments) {
          throw new ResolutionError(
            `Could not resolve reference to ${node.name}`,
            node.interval
          )
        }

        const assignmentValue = targetModuleAssignments.get(node.name)

        if (!assignmentValue) {
          throw new ResolutionError(
            `Could not resolve reference to ${node.name}`,
            node.interval
          )
        }

        node.resolvedType = assignmentValue
      },
    })

    walkAST(module.ast)
  }

  return program
}
