import { FutureInstance } from 'fluture'

export interface Cache<T> {
  get(key: string): FutureInstance<Error, T | undefined>
  set(key: string, value: T, ttl?: number): FutureInstance<Error, void>
  delete(key: string): FutureInstance<Error, boolean>
  clear(): FutureInstance<Error, void>
}
