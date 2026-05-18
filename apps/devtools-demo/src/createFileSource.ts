import { createBinaryWireFormatSource, Source } from '@repro/playback'

export function createFileSource(file: File): Source {
  return createBinaryWireFormatSource(file.stream())
}
