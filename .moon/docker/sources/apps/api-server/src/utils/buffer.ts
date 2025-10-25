export function bufferToDataView(buf: Buffer): DataView {
  return new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
}
