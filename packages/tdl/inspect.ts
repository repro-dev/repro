/**
 * Public subpath export for TDL byte-layout inspection helpers.
 *
 * Import from `@repro/tdl/inspect` when you need encoded sizing or framing
 * information without coupling product code to handwritten layout arithmetic.
 */
export {
  getBufferFrameByteLength,
  getByteLength,
  getDataByteLength,
  getHeaderByteLength,
  getVectorHeaderByteLength,
} from './src/inspect'
