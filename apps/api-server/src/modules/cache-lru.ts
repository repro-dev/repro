import { FutureInstance, resolve } from 'fluture'
import { Cache } from './cache'

interface CacheEntry<T> {
  value: T
  expiresAt: number | null
}

interface Config {
  maxSize: number
  defaultTTL?: number
}

export function createLRUCache<T>(config: Config): Cache<T> {
  const entries = new Map<string, CacheEntry<T>>()

  function isExpired(entry: CacheEntry<T>): boolean {
    return entry.expiresAt !== null && Date.now() >= entry.expiresAt
  }

  function evictLRU(): void {
    const oldest = entries.keys().next()

    if (!oldest.done) {
      entries.delete(oldest.value)
    }
  }

  function get(key: string): FutureInstance<Error, T | undefined> {
    const entry = entries.get(key)

    if (entry === undefined) {
      return resolve(undefined)
    }

    if (isExpired(entry)) {
      entries.delete(key)
      return resolve(undefined)
    }

    entries.delete(key)
    entries.set(key, entry)

    return resolve(entry.value)
  }

  function set(key: string, value: T, ttl?: number): FutureInstance<Error, void> {
    if (config.maxSize <= 0) {
      return resolve(undefined)
    }

    entries.delete(key)

    if (entries.size >= config.maxSize) {
      evictLRU()
    }

    const effectiveTTL = ttl ?? config.defaultTTL
    const expiresAt =
      effectiveTTL !== undefined ? Date.now() + effectiveTTL : null

    entries.set(key, { value, expiresAt })

    return resolve(undefined)
  }

  function del(key: string): FutureInstance<Error, boolean> {
    return resolve(entries.delete(key))
  }

  function clear(): FutureInstance<Error, void> {
    entries.clear()
    return resolve(undefined)
  }

  return {
    get,
    set,
    delete: del,
    clear,
  }
}
