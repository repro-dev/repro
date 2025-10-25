import { attemptP, FutureInstance } from 'fluture'
import Sqids from 'sqids'

export function attemptQuery<R>(
  fn: () => Promise<R>
): FutureInstance<Error, R> {
  return attemptP<Error, R>(fn)
}

const sqids = new Sqids({
  // Shuffled default alphabet to further obfuscate IDs
  alphabet: 'ELR7gGeX6QBJtykFzaAjixmP4of8uhNYDOVH02T1nI9MrUSCvW3KZqsplc5dwb',
  minLength: 7,
})

export function encodeId(id: number): string {
  return sqids.encode([id])
}

export function decodeId(id: string): number | null {
  return sqids.decode(id)[0] ?? null
}

export interface HasId<T> {
  id: T
}

export function withEncodedId<T extends HasId<number>>(
  obj: T
): Omit<T, 'id'> & HasId<string> {
  return {
    ...obj,
    id: encodeId(obj.id),
  }
}
