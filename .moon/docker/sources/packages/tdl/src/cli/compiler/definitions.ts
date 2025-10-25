import {
  ArrayTypeNode,
  AssignmentNode,
  ASTNodeType,
  BooleanLiteralTypeNode,
  BooleanTypeNode,
  BufferTypeNode,
  CharTypeNode,
  EnumLiteralTypeNode,
  FloatTypeNode,
  IntegerTypeNode,
  MapTypeNode,
  OptionNode,
  ReferenceNode,
  StringTypeNode,
  StructTypeNode,
  TimestampTypeNode,
  TypeNode,
  UnionTypeNode,
  UUIDTypeNode,
  VectorTypeNode,
} from '../parser/ASTTypes'

export function generateIntegerType(_: IntegerTypeNode) {
  return 'number'
}

export function generateFloatType(_: FloatTypeNode) {
  return 'number'
}

export function generateCharType(_: CharTypeNode) {
  return 'string'
}

export function generateStringType(_: StringTypeNode) {
  return 'string'
}

export function generateUUIDType(_: UUIDTypeNode) {
  return 'string'
}

export function generateTimestampType(_: TimestampTypeNode) {
  // TODO: represent timestamp as a 64-bit integer
  return 'string'
}

export function generateBooleanType(_: BooleanTypeNode) {
  return 'boolean'
}

export function generateBooleanLiteralType(node: BooleanLiteralTypeNode) {
  return node.value ? 'true' : 'false'
}

export function generateBufferType(_: BufferTypeNode) {
  return 'ArrayBuffer'
}

export function generateEnumLiteralType(node: EnumLiteralTypeNode) {
  return `${generateReference(node.reference)}.${node.enumProperty}`
}

function range(start: number, end: number) {
  return Array.from({ length: end - start }, (_, i) => i + start)
}

export function generateArrayType(node: ArrayTypeNode): string {
  return `[${range(0, node.size)
    .map(_ => generateType(node.elementType))
    .join(', ')}]`
}

export function generateVectorType(node: VectorTypeNode): string {
  return `Array<${generateType(node.elementType)}>`
}

export function generateMapType(node: MapTypeNode): string {
  return `Record<${generateType(node.keyType)}, ${generateType(
    node.valueType
  )}>`
}

export function generateStructType(node: StructTypeNode): string {
  const properties = node.properties.map(
    assignment => `${assignment.name}: ${generateType(assignment.value)}`
  )

  return `{
    ${properties.join('\n')} 
  }`
}

export function generateUnionType(node: UnionTypeNode) {
  return `tdl.Box<${node.references.map(generateReference).join(' | ')}>`
}

export function generateReference(node: ReferenceNode) {
  return node.name
}

export function generateType(node: TypeNode | OptionNode | ReferenceNode) {
  const valueNode = node.type === ASTNodeType.Option ? node.value : node
  let valueType = ''

  switch (valueNode.type) {
    case ASTNodeType.IntegerType:
      valueType = generateIntegerType(valueNode)
      break

    case ASTNodeType.FloatType:
      valueType = generateFloatType(valueNode)
      break

    case ASTNodeType.CharType:
      valueType = generateCharType(valueNode)
      break

    case ASTNodeType.StringType:
      valueType = generateStringType(valueNode)
      break

    case ASTNodeType.UUIDType:
      valueType = generateUUIDType(valueNode)
      break

    case ASTNodeType.TimestampType:
      valueType = generateTimestampType(valueNode)
      break

    case ASTNodeType.BooleanType:
      valueType = generateBooleanType(valueNode)
      break

    case ASTNodeType.BooleanLiteralType:
      valueType = generateBooleanLiteralType(valueNode)
      break

    case ASTNodeType.BufferType:
      valueType = generateBufferType(valueNode)
      break

    case ASTNodeType.EnumLiteralType:
      valueType = generateEnumLiteralType(valueNode)
      break

    case ASTNodeType.ArrayType:
      valueType = generateArrayType(valueNode)
      break

    case ASTNodeType.VectorType:
      valueType = generateVectorType(valueNode)
      break

    case ASTNodeType.MapType:
      valueType = generateMapType(valueNode)
      break

    case ASTNodeType.StructType:
      valueType = generateStructType(valueNode)
      break

    case ASTNodeType.UnionType:
      valueType = generateUnionType(valueNode)
      break

    case ASTNodeType.Reference:
      valueType = generateReference(valueNode)
      break

    default:
      throw new Error(`Unknown type: ${valueNode.type}`)
  }

  if (valueType && node.type === ASTNodeType.Option) {
    valueType = `${valueType} | null`
  }

  return valueType
}

export function generateAssignment(node: AssignmentNode) {
  if (node.value.type === ASTNodeType.EnumType) {
    return `export enum ${node.name} {
      ${node.value.properties
        .map(property => `${property.name} = ${property.value}`)
        .join(',\n')}
    }`
  }

  return `export type ${node.name} = ${generateType(node.value)}`
}
