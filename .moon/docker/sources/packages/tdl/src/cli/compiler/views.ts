import {
  ArrayTypeNode,
  AssignmentNode,
  ASTNodeType,
  BooleanLiteralTypeNode,
  BooleanTypeNode,
  BufferTypeNode,
  CharTypeNode,
  EnumLiteralTypeNode,
  EnumTypeNode,
  FixedLengthType,
  FloatTypeNode,
  IntegerTypeNode,
  MapTypeNode,
  OptionNode,
  ReferenceNode,
  StringLikeType,
  StringTypeNode,
  StructTypeNode,
  TimestampTypeNode,
  TypeNode,
  UnionTypeNode,
  UUIDTypeNode,
  VectorTypeNode,
} from '../parser/ASTTypes'
import { ResolutionError } from '../parser/errors'

function getDescriptorType(node: OptionNode | TypeNode) {
  const valueNode = node.type === ASTNodeType.Option ? node.value : node

  switch (valueNode.type) {
    case ASTNodeType.ArrayType:
      return 'tdl.ArrayDescriptor'

    case ASTNodeType.BooleanLiteralType:
    case ASTNodeType.BooleanType:
      return 'tdl.BooleanDescriptor'

    case ASTNodeType.BufferType:
      return 'tdl.BufferDescriptor'

    case ASTNodeType.CharType:
      return 'tdl.CharDescriptor'

    case ASTNodeType.EnumLiteralType:
    case ASTNodeType.EnumType:
    case ASTNodeType.IntegerType:
      return 'tdl.IntegerDescriptor'

    case ASTNodeType.FloatType:
      return 'tdl.FloatDescriptor'

    case ASTNodeType.MapType:
      return 'tdl.MapDescriptor'

    case ASTNodeType.StringType:
    case ASTNodeType.TimestampType:
      return 'tdl.StringDescriptor'

    case ASTNodeType.StructType:
      return 'tdl.StructDescriptor'

    case ASTNodeType.UnionType:
      return 'tdl.UnionDescriptor'

    case ASTNodeType.UUIDType:
      return 'tdl.UUIDDescriptor'

    case ASTNodeType.VectorType:
      return 'tdl.VectorDescriptor'

    case ASTNodeType.Reference:
      return `typeof ${valueNode.name}View.descriptor`

    default:
      return 'unknown'
  }
}

function generateIntegerDescriptor(node: IntegerTypeNode) {
  return `{
    type: 'integer',
    signed: ${node.signed},
    bits: ${node.bytes * 8},
  }`
}

function generateFloatDescriptor(node: FloatTypeNode) {
  return `{ type: 'float', bits: ${node.bytes * 8} }`
}

function generateCharDescriptor(node: CharTypeNode) {
  return `{ type: 'char', bytes: ${node.bytes} }`
}

function generateStringDescriptor(_: StringTypeNode) {
  return `{ type: 'string' }`
}

function generateUUIDDescriptor(_: UUIDTypeNode) {
  return `{ type: 'uuid' }`
}

function generateTimestampDescriptor(_: TimestampTypeNode) {
  return `{ type: 'string' }`
}

function generateBooleanDescriptor(_: BooleanTypeNode) {
  return `{ type: 'bool' }`
}

function generateBooleanLiteralDescriptor(node: BooleanLiteralTypeNode) {
  return `{ type: 'bool', value: ${node.value} }`
}

function generateBufferDescriptor(_: BufferTypeNode) {
  return `{ type: 'buffer' }`
}

function generateEnumDescriptor(node: EnumTypeNode) {
  return generateIntegerDescriptor(node.valueType)
}

function generateEnumLiteralDescriptor(node: EnumLiteralTypeNode) {
  // TODO: add support for codec-level integer literals
  return `${node.reference.name}View.descriptor`
}

function generateArrayDescriptor(node: ArrayTypeNode): string {
  return `{
    type: 'array',
    size: ${node.size},
    items: ${generateFixedLengthDescriptor(node.elementType)},
  }`
}

function generateVectorDescriptor(node: VectorTypeNode): string {
  return `{
    type: 'vector',
    items: ${generateDescriptor(node.elementType)},
  }`
}

function generateMapDescriptor(node: MapTypeNode): string {
  return `{
    type: 'map',
    key: ${generateStringLikeDescriptor(node.keyType)},
    value: ${generateDescriptor(node.valueType)},
  }`
}

function generateStructDescriptor(node: StructTypeNode): string {
  return `{
    type: 'struct',
    fields: [
      ${node.properties.map(property => {
        return `['${property.name}', ${
          isReferenceNode(property.value)
            ? `${property.value.name}View.descriptor`
            : generateDescriptor(property.value)
        }]`
      })}
    ],
  }`
}

function generateUnionDescriptor(node: UnionTypeNode): string {
  return `{
    type: 'union',
    tagField: '${node.tagField}',
    descriptors: {
      ${node.references
        .map(reference => {
          const propertyType = reference.resolvedType as StructTypeNode | null

          if (propertyType === null) {
            throw new ResolutionError(
              `Could not resolve struct "${reference.name}"`,
              node.interval
            )
          }

          const tagType = (propertyType.properties.find(
            property => property.name === node.tagField
          )?.value ?? null) as EnumLiteralTypeNode | null

          if (tagType === null) {
            throw new ResolutionError(
              `Could not resolve tag field "${node.tagField}" on struct "${reference.name}"`,
              node.interval
            )
          }

          const key = `${tagType.reference.name}.${tagType.enumProperty}`
          const value = `${reference.name}View.descriptor`

          return `[${key}]: ${value}`
        })
        .join(',\n')}
    }
  }`
}

function generateDescriptor(node: TypeNode | OptionNode | ReferenceNode) {
  const isOptional = node.type === ASTNodeType.Option
  const valueNode = isOptional ? node.value : node

  let descriptor: string | null = null

  switch (valueNode.type) {
    case ASTNodeType.IntegerType:
      descriptor = generateIntegerDescriptor(valueNode)
      break

    case ASTNodeType.CharType:
      descriptor = generateCharDescriptor(valueNode)
      break

    case ASTNodeType.StringType:
      descriptor = generateStringDescriptor(valueNode)
      break

    case ASTNodeType.UUIDType:
      descriptor = generateUUIDDescriptor(valueNode)
      break

    case ASTNodeType.TimestampType:
      descriptor = generateTimestampDescriptor(valueNode)
      break

    case ASTNodeType.BooleanType:
      descriptor = generateBooleanDescriptor(valueNode)
      break

    case ASTNodeType.BooleanLiteralType:
      descriptor = generateBooleanLiteralDescriptor(valueNode)
      break

    case ASTNodeType.BufferType:
      descriptor = generateBufferDescriptor(valueNode)
      break

    case ASTNodeType.EnumType:
      descriptor = generateEnumDescriptor(valueNode)
      break

    case ASTNodeType.EnumLiteralType:
      descriptor = generateEnumLiteralDescriptor(valueNode)
      break

    case ASTNodeType.ArrayType:
      descriptor = generateArrayDescriptor(valueNode)
      break

    case ASTNodeType.VectorType:
      descriptor = generateVectorDescriptor(valueNode)
      break

    case ASTNodeType.MapType:
      descriptor = generateMapDescriptor(valueNode)
      break

    case ASTNodeType.StructType:
      descriptor = generateStructDescriptor(valueNode)
      break

    case ASTNodeType.UnionType:
      descriptor = generateUnionDescriptor(valueNode)
      break

    case ASTNodeType.Reference:
      descriptor = `${valueNode.name}View.descriptor`
      break

    default:
      throw new Error(`Unsupported type: ${valueNode.type}`)
  }

  if (isOptional && descriptor) {
    descriptor = `{ ...${descriptor}, nullable: true }`
  }

  return descriptor
}

function generateFixedLengthDescriptor(
  node: FixedLengthType | OptionNode | ReferenceNode
) {
  const isOptional = node.type === ASTNodeType.Option
  const valueNode = isOptional ? node.value : node

  let descriptor: string | null = null

  switch (valueNode.type) {
    case ASTNodeType.IntegerType:
      descriptor = generateIntegerDescriptor(valueNode)
      break

    case ASTNodeType.FloatType:
      descriptor = generateFloatDescriptor(valueNode)
      break

    case ASTNodeType.CharType:
      descriptor = generateCharDescriptor(valueNode)
      break

    case ASTNodeType.UUIDType:
      descriptor = generateUUIDDescriptor(valueNode)
      break

    case ASTNodeType.TimestampType:
      descriptor = generateTimestampDescriptor(valueNode)
      break

    case ASTNodeType.BooleanType:
      descriptor = generateBooleanDescriptor(valueNode)
      break

    case ASTNodeType.BooleanLiteralType:
      descriptor = generateBooleanLiteralDescriptor(valueNode)
      break

    case ASTNodeType.EnumType:
      descriptor = generateEnumDescriptor(valueNode)
      break

    case ASTNodeType.EnumLiteralType:
      descriptor = generateEnumLiteralDescriptor(valueNode)
      break

    case ASTNodeType.ArrayType:
      descriptor = generateArrayDescriptor(valueNode)
      break

    case ASTNodeType.Reference:
      descriptor = `${valueNode.name}View.descriptor`
      break

    default:
      throw new Error(`Unsupported type: ${valueNode.type}`)
  }

  if (isOptional && descriptor) {
    descriptor = `{ ...${descriptor}, nullable: true }`
  }

  return descriptor
}

function generateStringLikeDescriptor(
  node: StringLikeType | OptionNode | ReferenceNode
) {
  const isOptional = node.type === ASTNodeType.Option
  const valueNode = isOptional ? node.value : node

  let descriptor: string | null = null

  switch (valueNode.type) {
    case ASTNodeType.StringType:
      descriptor = generateStringDescriptor(valueNode)
      break

    case ASTNodeType.CharType:
      descriptor = generateCharDescriptor(valueNode)
      break

    case ASTNodeType.Reference:
      descriptor = `${valueNode.name}View.descriptor`
      break

    default:
      throw new Error(`Unsupported type: ${valueNode.type}`)
  }

  if (isOptional && descriptor) {
    descriptor = `{ ...${descriptor}, nullable: true }`
  }

  return descriptor
}

function isReferenceNode(
  node: TypeNode | OptionNode | ReferenceNode
): node is ReferenceNode {
  return node.type === ASTNodeType.Reference
}

export function generateAssignment(node: AssignmentNode) {
  if (isReferenceNode(node.value)) {
    return `export const ${node.name}View = ${node.value.name}View`
  }

  return `
    export type ${node.name}View = tdl.View<
      ${getDescriptorType(node.value)},
      ${node.name}
    >

    export const ${node.name}View = tdl.createView<
      ${getDescriptorType(node.value)},
      ${node.name}
    >(${generateDescriptor(node.value)})
  `
}
