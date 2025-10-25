import { ASTNode, ASTNodeType, StructTypeNode } from './ASTTypes'
import { RESERVED_KEYWORDS } from './constants'
import { createASTWalker } from './createASTWalker'
import { ResolutionError, ValidationError } from './errors'
import { Program } from './types'

function findDuplicateNodesBySelector<T extends ASTNode, R = any>(
  nodes: Array<T>,
  selector: (node: T) => R
) {
  const nodesByKey = new Map<R, Array<T>>()

  for (const node of nodes) {
    const key = selector(node)
    const nodesForKey = nodesByKey.get(key) || []
    nodesForKey.push(node)
    nodesByKey.set(key, nodesForKey)
  }

  return Array.from(nodesByKey.values())
    .filter(nodes => nodes.length > 1)
    .flat()
}

function isOneOfType(types: Array<ASTNodeType>, node: ASTNode): boolean {
  let valueNode: ASTNode | null =
    node.type === ASTNodeType.Option ? node.value : node
  valueNode =
    valueNode.type === ASTNodeType.Reference
      ? valueNode.resolvedType
      : valueNode

  if (!valueNode) {
    return false
  }

  return types.includes(valueNode.type)
}

function isFixedLengthType(node: ASTNode): boolean {
  return isOneOfType(
    [
      ASTNodeType.IntegerType,
      ASTNodeType.FloatType,
      ASTNodeType.CharType,
      ASTNodeType.BooleanType,
      ASTNodeType.BooleanLiteralType,
      ASTNodeType.EnumType,
      ASTNodeType.EnumLiteralType,
      ASTNodeType.ArrayType,
    ],
    node
  )
}

function isStringLikeType(node: ASTNode): boolean {
  return isOneOfType(
    [
      ASTNodeType.CharType,
      ASTNodeType.StringType,
      ASTNodeType.UUIDType,
      ASTNodeType.TimestampType,
    ],
    node
  )
}

function isStructType(node: ASTNode): node is StructTypeNode {
  return node.type === ASTNodeType.StructType
}

export function validate(program: Program): Program {
  const moduleNames = new Set(program.map(module => module.name))
  const programSymbolMap = new Map<string, Set<string>>()

  for (const module of program) {
    const walkAST = createASTWalker()

    walkAST.accept({
      [ASTNodeType.ImportDeclaration]: node => {
        if (!moduleNames.has(node.module)) {
          throw new ValidationError(
            `Unknown module "${node.module}"`,
            node.interval
          )
        }

        const symbols: Array<string> = []

        switch (node.importNames.type) {
          case ASTNodeType.SingleNamedImport:
            symbols.push(node.importNames.name)
            break

          case ASTNodeType.NamedImports:
            symbols.push(...node.importNames.names)
            break
        }

        for (const symbol of symbols) {
          if (!programSymbolMap.get(node.module)?.has(symbol)) {
            throw new ValidationError(
              `Module "${node.module}" does not export "${symbol}"`,
              node.interval
            )
          }
        }
      },

      [ASTNodeType.Assignment]: node => {
        if (RESERVED_KEYWORDS.has(node.name)) {
          throw new ValidationError(
            `Cannot assign to reserved keyword "${node.name}"`,
            node.interval
          )
        }

        const symbols = programSymbolMap.get(module.name) || new Set<string>()
        symbols.add(node.name)
        programSymbolMap.set(module.name, symbols)
      },

      [ASTNodeType.EnumType]: node => {
        const duplicateNames = findDuplicateNodesBySelector(
          node.properties,
          property => property.name
        )
        const firstDuplicateName = duplicateNames.at(0)

        if (firstDuplicateName) {
          throw new ValidationError(
            `Duplicate enum property "${firstDuplicateName.name}"`,
            firstDuplicateName.interval
          )
        }

        const duplicateValues = findDuplicateNodesBySelector(
          node.properties,
          property => property.value
        )
        const firstDuplicateValue = duplicateValues.at(0)

        if (firstDuplicateValue) {
          throw new ValidationError(
            `Duplicate enum value "${firstDuplicateValue.value}"`,
            firstDuplicateValue.interval
          )
        }

        const bits = node.valueType.bytes * 8

        const minValue = node.valueType.signed ? -(2 ** (bits - 1)) : 0

        const maxValue = node.valueType.signed
          ? 2 ** (bits - 1) - 1
          : 2 ** bits - 1

        const values = node.properties.map(property => property.value)

        if (values.some(value => value < minValue || value > maxValue)) {
          throw new ValidationError(`Enum values out of range`, node.interval)
        }
      },

      [ASTNodeType.EnumLiteralType]: node => {
        const resolvedType = node.reference.resolvedType

        if (resolvedType === null) {
          throw new ResolutionError(
            `Could not resolve type "${node.reference.name}"`,
            node.interval
          )
        }

        if (resolvedType.type !== ASTNodeType.EnumType) {
          throw new ValidationError(
            `"${node.reference.name}" is not a valid enum type`,
            node.interval
          )
        }

        const enumPropertyKeys = resolvedType.properties.map(
          property => property.name
        )

        if (!enumPropertyKeys.includes(node.enumProperty)) {
          throw new ValidationError(
            `Property "${node.enumProperty}" does not exist on enum "${node.reference.name}"`,
            node.interval
          )
        }
      },

      [ASTNodeType.ArrayType]: node => {
        if (!isFixedLengthType(node.elementType)) {
          throw new ValidationError(
            `Array element type must be fixed length`,
            node.interval
          )
        }
      },

      [ASTNodeType.MapType]: node => {
        if (!isStringLikeType(node.keyType)) {
          throw new ValidationError(
            `Map key type must be string-like`,
            node.interval
          )
        }
      },

      [ASTNodeType.UnionType]: node => {
        const references = node.references
        const structRefToEnumRef: Array<[string, [string, string]]> = []

        for (const reference of references) {
          const resolvedType = reference.resolvedType

          if (resolvedType === null) {
            throw new ResolutionError(
              `Could not resolve type "${reference.name}"`,
              node.interval
            )
          }

          if (!isStructType(resolvedType)) {
            throw new ValidationError(
              `"${reference.name}" is not a struct type`,
              node.interval
            )
          }

          const structTagFieldProperty = resolvedType.properties.find(
            property => property.name === node.tagField
          )

          if (!structTagFieldProperty) {
            throw new ValidationError(
              `Struct "${reference.name}" is missing the tag property "${node.tagField}"`,
              node.interval
            )
          }

          const structTagField = structTagFieldProperty.value
          const structTag =
            structTagField.type === ASTNodeType.Reference
              ? structTagField.resolvedType
              : structTagField

          if (!structTag || structTag.type !== ASTNodeType.EnumLiteralType) {
            throw new ValidationError(
              `Property "${node.tagField}" of struct "${reference.name}" is not an enum literal`,
              node.interval
            )
          }

          structRefToEnumRef.push([
            reference.name,
            [structTag.reference.name, structTag.enumProperty],
          ])
        }

        let hasDistinctEnumRefs = false
        let hasDuplicateEnumLiteralRefs = false

        let lastEnumRef: string | null = null
        const enumLiteralRefs = new Set<string>()

        for (const [, [enumRef, enumProperty]] of structRefToEnumRef) {
          if (lastEnumRef !== null && lastEnumRef !== enumRef) {
            hasDistinctEnumRefs = true
          }

          if (enumLiteralRefs.has(`${enumRef}.${enumProperty}`)) {
            hasDuplicateEnumLiteralRefs = true
          }

          lastEnumRef = enumRef
          enumLiteralRefs.add(`${enumRef}.${enumProperty}`)
        }

        if (hasDistinctEnumRefs) {
          throw new ValidationError(
            `Structs are not tagged with the same enum: ${structRefToEnumRef
              .map(([structRef, [enumRef]]) => `${structRef} -> ${enumRef}`)
              .join(', ')}`,
            node.interval
          )
        }

        if (hasDuplicateEnumLiteralRefs) {
          throw new ValidationError(
            `Structs are tagged with the same enum value: ${structRefToEnumRef
              .map(
                ([structRef, [enumRef, enumProperty]]) =>
                  `${structRef} -> ${enumRef}.${enumProperty}`
              )
              .join(', ')}`,
            node.interval
          )
        }
      },
    })

    walkAST(module.ast)
  }

  return program
}
