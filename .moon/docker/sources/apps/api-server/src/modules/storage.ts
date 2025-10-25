import { FutureInstance } from 'fluture'
import { Readable } from 'node:stream'

export interface Storage {
  exists(path: string): FutureInstance<Error, boolean>
  read(path: string): FutureInstance<Error, Readable>
  write(path: string, data: Readable): FutureInstance<Error, void>
}
