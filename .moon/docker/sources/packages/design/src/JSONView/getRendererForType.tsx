import React from 'react'
import { colors } from '../theme'
import { ArrayRenderer } from './ArrayRenderer'
import { BooleanRenderer } from './BooleanRenderer'
import { NullRenderer } from './NullRenderer'
import { NumberRenderer } from './NumberRenderer'
import { ObjectRenderer } from './ObjectRenderer'
import { StringRenderer } from './StringRenderer'
import { UndefinedRenderer } from './UndefinedRenderer'

export function getRendererForType(
  objectKey: string | null,
  value: any,
  level: number
) {
  if (value === undefined) {
    return <UndefinedRenderer level={level} objectKey={objectKey} />
  } else if (value === null) {
    return <NullRenderer level={level} objectKey={objectKey} />
  } else if (value instanceof Date) {
    return (
      <StringRenderer
        level={level}
        objectKey={objectKey}
        value={`Date(${value.toLocaleString()})`}
        color={colors.sky['700']}
      />
    )
  } else if (Array.isArray(value)) {
    return <ArrayRenderer level={level} objectKey={objectKey} value={value} />
  } else if (typeof value === 'object') {
    return <ObjectRenderer level={level} objectKey={objectKey} value={value} />
  } else if (typeof value === 'number') {
    return <NumberRenderer level={level} objectKey={objectKey} value={value} />
  } else if (typeof value === 'boolean') {
    return <BooleanRenderer level={level} objectKey={objectKey} value={value} />
  } else {
    value = objectKey !== null ? `"${value.toString()}"` : value
    const color = objectKey !== null ? colors.rose['700'] : colors.slate['700']
    return (
      <StringRenderer
        level={level}
        objectKey={objectKey}
        value={value}
        color={color}
      />
    )
  }
}
