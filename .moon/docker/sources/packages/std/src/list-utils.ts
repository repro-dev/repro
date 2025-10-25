import { List, View } from '@repro/tdl'
import { gunzipSync, gzipSync } from 'fflate'

const u8 = 1
const u32 = 4
const LITTLE_ENDIAN = true

export function packList<V extends View<any, any>>(list: List<V>): ArrayBuffer {
  const items = list.toSource()
  const byteLength =
    u32 + items.reduce((len, item) => len + u32 + item.byteLength, 0)
  const buffer = new ArrayBuffer(byteLength)
  const dataView = new DataView(buffer)

  let pointer = 0
  dataView.setUint32(pointer, items.length, LITTLE_ENDIAN)
  pointer += u32

  for (const item of items) {
    dataView.setUint32(pointer, item.byteLength, LITTLE_ENDIAN)
    pointer += u32

    for (let i = 0, len = item.byteLength; i < len; i++) {
      dataView.setUint8(pointer, item.getUint8(i))
      pointer += u8
    }
  }

  return gzipSync(new Uint8Array(buffer))
}

export function unpackListInto<V extends View<any, any>>(
  buffer: ArrayBuffer,
  list: List<V>
): void {
  const dataView = new DataView(gunzipSync(new Uint8Array(buffer)).buffer)
  const listSource = list.toSource()

  let pointer = 0
  const size = dataView.getUint32(pointer, LITTLE_ENDIAN)
  pointer += u32

  for (let i = 0; i < size; i++) {
    const byteLength = dataView.getUint32(pointer, LITTLE_ENDIAN)
    pointer += u32

    const item = new DataView(new ArrayBuffer(byteLength))

    for (let j = 0; j < byteLength; j++) {
      item.setUint8(j, dataView.getUint8(pointer))
      pointer += u8
    }

    listSource.push(item)
  }
}
