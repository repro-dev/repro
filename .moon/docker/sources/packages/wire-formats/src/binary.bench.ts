import { stress } from './bench-utils'
import { fromBinaryWireFormat, toBinaryWireFormat } from './binary'
import { Entity, EntityView } from './generated/binary-test-schema'
import { fromWireFormat, toWireFormat } from './legacyText'

const input: Array<Entity> = [
  {
    id: 1,
    name: 'foo',
    properties: { bar: 'baz' },
  },

  {
    id: 2,
    name: 'bar',
    properties: { baz: 'qux' },
  },
]

const output = toWireFormat(input)

const binaryInput = input.map(entity => EntityView.encode(entity))
const binaryOutput = toBinaryWireFormat(binaryInput)

console.table({
  toBinaryWireFormat: {
    'perf (ops/s)': stress(() => toBinaryWireFormat(binaryInput)),
    'size (bytes)': binaryOutput.byteLength,
  },

  fromBinaryWireFormat: {
    'perf (ops/s)': stress(() => fromBinaryWireFormat(binaryOutput)),
  },

  toWireFormat: {
    'perf (ops/s)': stress(() => toWireFormat(input)),
    'size (bytes)': new TextEncoder().encode(output).byteLength,
  },

  fromWireFormat: {
    'perf (ops/s)': stress(() => fromWireFormat(output)),
  },
})
