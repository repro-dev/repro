import expect from 'expect'
import { promise } from 'fluture'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'
import { Cache } from './cache'
import { createLRUCache } from './cache-lru'

describe('Modules > LRU Cache', () => {
  let cache: Cache<string>

  beforeEach(() => {
    cache = createLRUCache<string>({ maxSize: 3 })
  })

  describe('get/set', () => {
    it('should return undefined for a missing key', async () => {
      expect(await promise(cache.get('missing'))).toBeUndefined()
    })

    it('should store and retrieve a value', async () => {
      await promise(cache.set('a', 'alpha'))
      expect(await promise(cache.get('a'))).toBe('alpha')
    })

    it('should overwrite an existing key', async () => {
      await promise(cache.set('a', 'alpha'))
      await promise(cache.set('a', 'updated'))
      expect(await promise(cache.get('a'))).toBe('updated')
    })
  })

  describe('delete', () => {
    it('should remove a key and return true', async () => {
      await promise(cache.set('a', 'alpha'))
      expect(await promise(cache.delete('a'))).toBe(true)
      expect(await promise(cache.get('a'))).toBeUndefined()
    })

    it('should return false when deleting a missing key', async () => {
      expect(await promise(cache.delete('missing'))).toBe(false)
    })
  })

  describe('clear', () => {
    it('should remove all entries', async () => {
      await promise(cache.set('a', 'alpha'))
      await promise(cache.set('b', 'bravo'))
      await promise(cache.clear())
      expect(await promise(cache.get('a'))).toBeUndefined()
      expect(await promise(cache.get('b'))).toBeUndefined()
    })
  })

  describe('LRU eviction', () => {
    it('should evict the least-recently-used entry when at capacity', async () => {
      await promise(cache.set('a', 'alpha'))
      await promise(cache.set('b', 'bravo'))
      await promise(cache.set('c', 'charlie'))
      await promise(cache.set('d', 'delta'))

      expect(await promise(cache.get('a'))).toBeUndefined()
      expect(await promise(cache.get('b'))).toBe('bravo')
      expect(await promise(cache.get('c'))).toBe('charlie')
      expect(await promise(cache.get('d'))).toBe('delta')
    })

    it('should promote a key on get so it is not evicted', async () => {
      await promise(cache.set('a', 'alpha'))
      await promise(cache.set('b', 'bravo'))
      await promise(cache.set('c', 'charlie'))

      await promise(cache.get('a'))

      await promise(cache.set('d', 'delta'))

      expect(await promise(cache.get('a'))).toBe('alpha')
      expect(await promise(cache.get('b'))).toBeUndefined()
    })

    it('should not count an overwrite as a new entry', async () => {
      await promise(cache.set('a', 'alpha'))
      await promise(cache.set('b', 'bravo'))
      await promise(cache.set('c', 'charlie'))
      await promise(cache.set('a', 'updated'))

      expect(await promise(cache.get('a'))).toBe('updated')
      expect(await promise(cache.get('b'))).toBe('bravo')
      expect(await promise(cache.get('c'))).toBe('charlie')
    })
  })

  describe('TTL expiry', () => {
    let now: number
    let dateNowMock: ReturnType<typeof mock.method<typeof Date, 'now'>>

    beforeEach(() => {
      now = 1000
      dateNowMock = mock.method(Date, 'now', () => now)
    })

    afterEach(() => {
      dateNowMock.mock.restore()
    })

    it('should return undefined for an expired entry', async () => {
      await promise(cache.set('a', 'alpha', 500))

      now = 1500
      expect(await promise(cache.get('a'))).toBeUndefined()
    })

    it('should return the value before TTL expires', async () => {
      await promise(cache.set('a', 'alpha', 500))

      now = 1499
      expect(await promise(cache.get('a'))).toBe('alpha')
    })

    it('should use defaultTTL when no per-entry ttl is provided', async () => {
      cache = createLRUCache<string>({ maxSize: 3, defaultTTL: 200 })
      await promise(cache.set('a', 'alpha'))

      now = 1200
      expect(await promise(cache.get('a'))).toBeUndefined()
    })

    it('should allow per-entry ttl to override defaultTTL', async () => {
      cache = createLRUCache<string>({ maxSize: 3, defaultTTL: 200 })
      await promise(cache.set('a', 'alpha', 1000))

      now = 1500
      expect(await promise(cache.get('a'))).toBe('alpha')

      now = 2000
      expect(await promise(cache.get('a'))).toBeUndefined()
    })

    it('should not expire entries without a TTL', async () => {
      await promise(cache.set('a', 'alpha'))

      now = 999999999
      expect(await promise(cache.get('a'))).toBe('alpha')
    })
  })
})
