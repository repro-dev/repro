import { ASTNode, ASTNodeType } from './ASTTypes'
import { CollectedParseError, isParseError, ParseError } from './errors'

type ASTVisitor = {
  [K in ASTNodeType]: (node: Extract<ASTNode, { type: K }>) => void
}

interface ASTWalker {
  (node: ASTNode): void
  accept(visitor: Partial<ASTVisitor>): void
}

function ensureUnreachable(_: never): never {
  throw new Error('Unreachable')
}

export function createASTWalker(): ASTWalker {
  const visitors: Array<Partial<ASTVisitor>> = []

  function walk(rootNode: ASTNode): void {
    const queue: Array<ASTNode> = [rootNode]

    const collectedErrors: Array<ParseError> = []

    function visit<
      T extends ASTNodeType,
      U extends Extract<ASTNode, { type: T }>
    >(type: T, node: U) {
      for (const visitor of visitors) {
        const callback = visitor[type]

        if (callback) {
          try {
            callback(node)
          } catch (error) {
            if (isParseError(error)) {
              collectedErrors.push(error)
              continue
            }

            throw error
          }
        }
      }
    }

    let node: ASTNode | undefined

    while ((node = queue.shift())) {
      switch (node.type) {
        case ASTNodeType.StatementSet:
          queue.push(...node.statements)
          visit(ASTNodeType.StatementSet, node)
          break

        case ASTNodeType.ImportDeclaration:
          queue.push(node.importNames)
          visit(ASTNodeType.ImportDeclaration, node)
          break

        case ASTNodeType.SingleNamedImport:
          visit(ASTNodeType.SingleNamedImport, node)
          break

        case ASTNodeType.NamedImports:
          visit(ASTNodeType.NamedImports, node)
          break

        case ASTNodeType.Assignment:
          queue.push(node.value)
          visit(ASTNodeType.Assignment, node)
          break

        case ASTNodeType.Option:
          queue.push(node.value)
          visit(ASTNodeType.Option, node)
          break

        case ASTNodeType.IntegerType:
          visit(ASTNodeType.IntegerType, node)
          break

        case ASTNodeType.FloatType:
          visit(ASTNodeType.FloatType, node)
          break

        case ASTNodeType.CharType:
          visit(ASTNodeType.CharType, node)
          break

        case ASTNodeType.StringType:
          visit(ASTNodeType.StringType, node)
          break

        case ASTNodeType.UUIDType:
          visit(ASTNodeType.UUIDType, node)
          break

        case ASTNodeType.TimestampType:
          visit(ASTNodeType.TimestampType, node)
          break

        case ASTNodeType.BooleanType:
          visit(ASTNodeType.BooleanType, node)
          break

        case ASTNodeType.BooleanLiteralType:
          visit(ASTNodeType.BooleanLiteralType, node)
          break

        case ASTNodeType.BufferType:
          visit(ASTNodeType.BufferType, node)
          break

        case ASTNodeType.EnumType:
          queue.push(node.valueType, ...node.properties)
          visit(ASTNodeType.EnumType, node)
          break

        case ASTNodeType.EnumProperty:
          visit(ASTNodeType.EnumProperty, node)
          break

        case ASTNodeType.EnumLiteralType:
          queue.push(node.reference)
          visit(ASTNodeType.EnumLiteralType, node)
          break

        case ASTNodeType.ArrayType:
          queue.push(node.elementType)
          visit(ASTNodeType.ArrayType, node)
          break

        case ASTNodeType.VectorType:
          queue.push(node.elementType)
          visit(ASTNodeType.VectorType, node)
          break

        case ASTNodeType.MapType:
          queue.push(node.keyType, node.valueType)
          visit(ASTNodeType.MapType, node)
          break

        case ASTNodeType.StructType:
          queue.push(...node.properties)
          visit(ASTNodeType.StructType, node)
          break

        case ASTNodeType.StructProperty:
          queue.push(node.value)
          visit(ASTNodeType.StructProperty, node)
          break

        case ASTNodeType.Reference:
          visit(ASTNodeType.Reference, node)
          break

        case ASTNodeType.UnionType:
          queue.push(...node.references)
          visit(ASTNodeType.UnionType, node)
          break

        default:
          ensureUnreachable(node)
      }
    }

    if (collectedErrors.length > 0) {
      throw new CollectedParseError(collectedErrors)
    }
  }

  walk.accept = function accept(visitor: Partial<ASTVisitor>) {
    visitors.push(visitor)
  }

  return walk
}
