import { Interval } from 'ohm-js'

export enum ASTNodeType {
  StatementSet = 'StatementSet',

  ImportDeclaration = 'ImportDeclaration',
  SingleNamedImport = 'SingleNamedImport',
  NamedImports = 'NamedImports',

  Assignment = 'Assignment',

  Option = 'Option',

  IntegerType = 'IntegerType',
  FloatType = 'FloatType',
  CharType = 'CharType',
  StringType = 'StringType',
  UUIDType = 'UUIDType',
  TimestampType = 'TimestampType',
  BooleanType = 'BooleanType',
  BooleanLiteralType = 'BooleanLiteralType',
  BufferType = 'BufferType',
  EnumType = 'EnumType',
  EnumProperty = 'EnumProperty',
  EnumLiteralType = 'EnumLiteralType',
  ArrayType = 'ArrayType',
  VectorType = 'VectorType',
  MapType = 'MapType',
  StructType = 'StructType',
  StructProperty = 'StructProperty',
  UnionType = 'UnionType',
  UnionProperty = 'UnionProperty',

  Reference = 'Reference',
}

interface BaseASTNode {
  interval: Interval
}

export interface StatementSetNode extends BaseASTNode {
  type: ASTNodeType.StatementSet
  statements: Array<ASTChildNode>
}

export interface ImportDeclarationNode extends BaseASTNode {
  type: ASTNodeType.ImportDeclaration
  module: string
  importNames: ImportNode
}

export interface SingleNamedImportNode extends BaseASTNode {
  type: ASTNodeType.SingleNamedImport
  name: string
}

export interface NamedImportsNode extends BaseASTNode {
  type: ASTNodeType.NamedImports
  names: Array<string>
}

export type ImportNode = SingleNamedImportNode | NamedImportsNode

export interface AssignmentNode extends BaseASTNode {
  type: ASTNodeType.Assignment
  name: string
  value: TypeNode | ReferenceNode | OptionNode
}

export interface OptionNode extends BaseASTNode {
  type: ASTNodeType.Option
  value: TypeNode | ReferenceNode
}

export interface IntegerTypeNode extends BaseASTNode {
  type: ASTNodeType.IntegerType
  signed: boolean
  bytes: 1 | 2 | 4 | 8
}

export interface FloatTypeNode extends BaseASTNode {
  type: ASTNodeType.FloatType
  bytes: 4 | 8
}

export interface CharTypeNode extends BaseASTNode {
  type: ASTNodeType.CharType
  bytes: number
}

export interface StringTypeNode extends BaseASTNode {
  type: ASTNodeType.StringType
}

export interface UUIDTypeNode extends BaseASTNode {
  type: ASTNodeType.UUIDType
}

export interface TimestampTypeNode extends BaseASTNode {
  type: ASTNodeType.TimestampType
}

export interface BooleanTypeNode extends BaseASTNode {
  type: ASTNodeType.BooleanType
}

export interface BooleanLiteralTypeNode extends BaseASTNode {
  type: ASTNodeType.BooleanLiteralType
  value: boolean
}

export interface BufferTypeNode extends BaseASTNode {
  type: ASTNodeType.BufferType
}

export interface EnumTypeNode extends BaseASTNode {
  type: ASTNodeType.EnumType
  valueType: IntegerTypeNode
  properties: Array<EnumPropertyNode>
}

export interface EnumPropertyNode extends BaseASTNode {
  type: ASTNodeType.EnumProperty
  name: string
  value: number
}

export interface EnumLiteralTypeNode extends BaseASTNode {
  type: ASTNodeType.EnumLiteralType
  reference: ReferenceNode
  enumProperty: string
}

export interface ArrayTypeNode extends BaseASTNode {
  type: ASTNodeType.ArrayType
  size: number
  elementType: FixedLengthType | ReferenceNode
}

export interface VectorTypeNode extends BaseASTNode {
  type: ASTNodeType.VectorType
  elementType: TypeNode | ReferenceNode
}

export interface MapTypeNode extends BaseASTNode {
  type: ASTNodeType.MapType
  keyType: StringLikeType | ReferenceNode
  valueType: TypeNode | ReferenceNode
}

export interface StructTypeNode extends BaseASTNode {
  type: ASTNodeType.StructType
  properties: Array<StructPropertyNode>
}

export interface StructPropertyNode extends BaseASTNode {
  type: ASTNodeType.StructProperty
  name: string
  value: TypeNode | OptionNode | ReferenceNode
}

export interface ReferenceNode extends BaseASTNode {
  type: ASTNodeType.Reference
  name: string
  resolvedType: TypeNode | OptionNode | null
}

export interface UnionTypeNode extends BaseASTNode {
  type: ASTNodeType.UnionType
  tagField: string
  references: Array<ReferenceNode>
}

export type TypeNode =
  | IntegerTypeNode
  | FloatTypeNode
  | CharTypeNode
  | StringTypeNode
  | UUIDTypeNode
  | TimestampTypeNode
  | BooleanTypeNode
  | BooleanLiteralTypeNode
  | BufferTypeNode
  | EnumTypeNode
  | EnumLiteralTypeNode
  | ArrayTypeNode
  | VectorTypeNode
  | MapTypeNode
  | StructTypeNode
  | UnionTypeNode

export type FixedLengthType =
  | IntegerTypeNode
  | FloatTypeNode
  | CharTypeNode
  | UUIDTypeNode
  | BooleanTypeNode
  | BooleanLiteralTypeNode
  | EnumTypeNode
  | EnumLiteralTypeNode
  | ArrayTypeNode

export type StringLikeType = CharTypeNode | StringTypeNode | UUIDTypeNode

export type ASTChildNode = ImportDeclarationNode | AssignmentNode

export type ASTNode =
  | StatementSetNode
  | ASTChildNode
  | ImportNode
  | TypeNode
  | EnumPropertyNode
  | StructPropertyNode
  | ReferenceNode
  | OptionNode

export type ASTRootNode = StatementSetNode
