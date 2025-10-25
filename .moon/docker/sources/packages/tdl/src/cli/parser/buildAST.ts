import { NonterminalNode, TerminalNode } from 'ohm-js'
import grammar from '../grammar.ohm-bundle'
import { ASTNode, ASTNodeType, StatementSetNode } from './ASTTypes'
import { MatchError } from './errors'

const semantics = grammar.createSemantics()

const IntegerBytes = {
  int8: 1,
  uint8: 1,
  int16: 2,
  uint16: 2,
  int32: 4,
  uint32: 4,
  int64: 8,
  uint64: 8,
} as const

const FloatBytes = {
  float32: 4,
  float64: 8,
} as const

const IntegerSigned = {
  int8: true,
  uint8: false,
  int16: true,
  uint16: false,
  int32: true,
  uint32: false,
  int64: true,
  uint64: false,
} as const

semantics.addOperation<ASTNode>('buildAST', {
  Statements(importDefs, typeDefs) {
    return {
      type: ASTNodeType.StatementSet,
      statements: [
        ...importDefs.children.map(importDef => importDef.buildAST()),
        ...typeDefs.children.map(typeDef => typeDef.buildAST()),
      ],
      interval: this.source,
    }
  },

  ImportDef(_1, module, _3, importNames) {
    return {
      type: ASTNodeType.ImportDeclaration,
      module: module.sourceString,
      importNames: importNames.buildAST(),
      interval: this.source,
    }
  },

  SingleNamedImport(name) {
    return {
      type: ASTNodeType.SingleNamedImport,
      name: name.sourceString,
      interval: this.source,
    }
  },

  NamedImports(_1, names, _2) {
    return {
      type: ASTNodeType.NamedImports,
      names: names.asIteration().children.map(name => name.sourceString),
      interval: this.source,
    }
  },

  TypeDef(_1, assignment) {
    return assignment.buildAST()
  },

  Assignment(identifier, _1, maybeType) {
    return {
      type: ASTNodeType.Assignment,
      name: identifier.sourceString,
      value: maybeType.buildAST(),
      interval: this.source,
    }
  },

  Maybe(optional, type) {
    const isOptional = optional.numChildren > 0

    if (isOptional) {
      return {
        type: ASTNodeType.Option,
        value: type.buildAST(),
        interval: this.source,
      }
    }

    return type.buildAST()
  },

  IntegerType(value) {
    const literal = value.sourceString as keyof typeof IntegerBytes
    const signed = IntegerSigned[literal]
    const bytes = IntegerBytes[literal]

    return {
      type: ASTNodeType.IntegerType,
      signed,
      bytes,
      interval: this.source,
    }
  },

  FloatType(value) {
    const literal = value.sourceString as keyof typeof FloatBytes
    const bytes = FloatBytes[literal]

    return {
      type: ASTNodeType.FloatType,
      bytes,
      interval: this.source,
    }
  },

  CharType(_1, size, _2) {
    return {
      type: ASTNodeType.CharType,
      bytes: Number(size.sourceString),
      interval: this.source,
    }
  },

  StringType(_1) {
    return {
      type: ASTNodeType.StringType,
      interval: this.source,
    }
  },

  UUIDType(_1) {
    return {
      type: ASTNodeType.UUIDType,
      interval: this.source,
    }
  },

  TimestampType(_1) {
    return {
      type: ASTNodeType.TimestampType,
      interval: this.source,
    }
  },

  BooleanType(_1) {
    return {
      type: ASTNodeType.BooleanType,
      interval: this.source,
    }
  },

  BooleanLiteralType(_1) {
    return {
      type: ASTNodeType.BooleanLiteralType,
      value: this.sourceString === 'true',
      interval: this.source,
    }
  },

  BufferType(_1) {
    return {
      type: ASTNodeType.BufferType,
      interval: this.source,
    }
  },

  EnumType(_1, valueType, _2, properties, _3) {
    return {
      type: ASTNodeType.EnumType,
      valueType: valueType.buildAST(),
      properties: properties.children.map(property => property.buildAST()),
      interval: this.source,
    }
  },

  EnumProperty(name, _2, value) {
    return {
      type: ASTNodeType.EnumProperty,
      name: name.sourceString,
      value: Number(value.sourceString),
      interval: this.source,
    }
  },

  EnumLiteralType(reference, _1, enumProperty) {
    return {
      type: ASTNodeType.EnumLiteralType,
      reference: reference.buildAST(),
      enumProperty: enumProperty.sourceString,
      interval: this.source,
    }
  },

  ArrayType(_1, size, _2, elementType, _3) {
    return {
      type: ASTNodeType.ArrayType,
      size: Number(size.sourceString),
      elementType: elementType.buildAST(),
      interval: this.source,
    }
  },

  VectorType(_1, elementType, _2) {
    return {
      type: ASTNodeType.VectorType,
      elementType: elementType.buildAST(),
      interval: this.source,
    }
  },

  MapType(_1, keyType, _2, valueType, _3) {
    return {
      type: ASTNodeType.MapType,
      keyType: keyType.buildAST(),
      valueType: valueType.buildAST(),
      interval: this.source,
    }
  },

  StructType(_1, properties, _3) {
    const indexedPropertyNodes = properties.children.map(childNode => {
      const [index, _, property] = childNode.children as [
        NonterminalNode,
        TerminalNode,
        NonterminalNode
      ]

      return [Number(index.sourceString), property.buildAST()]
    })

    indexedPropertyNodes.sort((a, b) => a[0] - b[0])

    return {
      type: ASTNodeType.StructType,
      properties: indexedPropertyNodes.map(([, property]) => property),
      interval: this.source,
    }
  },

  StructAssignment(identifier, _1, maybeType) {
    return {
      type: ASTNodeType.StructProperty,
      name: identifier.sourceString,
      value: maybeType.buildAST(),
      interval: this.source,
    }
  },

  ReferenceType(reference) {
    return {
      type: ASTNodeType.Reference,
      name: reference.sourceString,
      resolvedType: null,
      interval: this.source,
    }
  },

  UnionType(_1, tagField, _3, references, _5) {
    return {
      type: ASTNodeType.UnionType,
      tagField: tagField.sourceString,
      references: references.children.map(reference => reference.buildAST()),
      interval: this.source,
    }
  },
})

export function buildAST(input: string): StatementSetNode {
  const match = grammar.match(input)

  if (!match.succeeded()) {
    throw new MatchError(match.message || '', match.getInterval())
  }

  return semantics(match).buildAST()
}
