import { FutureInstance } from 'fluture'
import { Readable } from 'node:stream'

export interface Storage {
  exists(path: string): FutureInstance<Error, boolean>
  read(
    path: string,
    range?: { start: number; end: number }
  ): FutureInstance<Error, Readable>
  write(path: string, data: Readable): FutureInstance<Error, void>
  delete(path: string): FutureInstance<Error, void>
}

export type ByteRange = { start: number; end: number }
