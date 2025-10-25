export interface IntegerDescriptor {
  type: 'integer'
  signed: boolean
  bits: 8 | 16 | 32 | 64
  nullable?: boolean
}

export interface FloatDescriptor {
  type: 'float'
  bits: 32 | 64
  nullable?: boolean
}

export interface CharDescriptor {
  type: 'char'
  bytes: number
  nullable?: boolean
}

export interface StringDescriptor {
  type: 'string'
  nullable?: boolean
}

export interface UUIDDescriptor {
  type: 'uuid'
  nullable?: boolean
}

export interface BooleanDescriptor {
  type: 'bool'
  value?: boolean
  nullable?: boolean
}

export interface BufferDescriptor {
  type: 'buffer'
  nullable?: boolean
}

export interface ArrayDescriptor {
  type: 'array'
  size: number
  items: IntegerDescriptor | CharDescriptor | BooleanDescriptor
  nullable?: boolean
}

export interface VectorDescriptor {
  type: 'vector'
  items: AnyDescriptor
  nullable?: boolean
}

export interface MapDescriptor {
  type: 'map'
  key: StringDescriptor | CharDescriptor
  value: AnyDescriptor
  nullable?: boolean
}

export interface StructDescriptor {
  type: 'struct'
  fields: Array<[string, AnyDescriptor]>
  nullable?: boolean
}

export interface UnionDescriptor {
  type: 'union'
  tagField: string
  descriptors: Record<number, StructDescriptor>
  nullable?: boolean
}

export type AnyDescriptor =
  | IntegerDescriptor
  | FloatDescriptor
  | CharDescriptor
  | StringDescriptor
  | UUIDDescriptor
  | BooleanDescriptor
  | BufferDescriptor
  | VectorDescriptor
  | ArrayDescriptor
  | MapDescriptor
  | StructDescriptor
  | UnionDescriptor
