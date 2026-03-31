import { StorageMessage, StorageOperation, StorageType } from '@repro/domain'
import { ObserverLike } from '@repro/observer-utils'
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { createStorageObserver } from './observe'

// Simple in-memory Storage mock
class MockStorage implements Storage {
  private _data: Map<string, string> = new Map()

  get length(): number {
    return this._data.size
  }

  key(index: number): string | null {
    return Array.from(this._data.keys())[index] ?? null
  }

  getItem(key: string): string | null {
    return this._data.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this._data.set(key, value)
  }

  removeItem(key: string): void {
    this._data.delete(key)
  }

  clear(): void {
    this._data.clear()
  }
}

describe('createStorageObserver', () => {
  let localStorageMock: MockStorage
  let sessionStorageMock: MockStorage
  let observer: ObserverLike
  let events: StorageMessage[]

  function subscriber(message: StorageMessage) {
    events.push(message)
  }

  beforeEach(() => {
    localStorageMock = new MockStorage()
    sessionStorageMock = new MockStorage()

    // Install mocks on global
    Object.defineProperty(globalThis, 'localStorage', {
      value: localStorageMock,
      writable: true,
      configurable: true,
    })
    Object.defineProperty(globalThis, 'sessionStorage', {
      value: sessionStorageMock,
      writable: true,
      configurable: true,
    })

    events = []
    observer = createStorageObserver(subscriber)
  })

  afterEach(() => {
    observer.disconnect()
  })

  it('returns an ObserverLike with observe and disconnect methods', () => {
    assert.equal(typeof observer.observe, 'function')
    assert.equal(typeof observer.disconnect, 'function')
  })

  describe('after observe()', () => {
    beforeEach(() => {
      // Pass null — storage observer doesn't use the target or vtree args
      observer.observe(null as any, null as any)
    })

    // localStorage tests
    describe('localStorage', () => {
      it('localStorage.setItem emits StorageMessage with setItem operation', () => {
        localStorage.setItem('foo', 'bar')
        assert.equal(events.length, 1)
        const msg = events[0]!
        assert.equal(msg.storageType, StorageType.localStorage)
        assert.equal(msg.operation, StorageOperation.setItem)
        assert.equal(msg.key, 'foo')
        assert.equal(msg.oldValue, null)
        assert.equal(msg.newValue, 'bar')
        assert.equal(msg.frameId, 0)
      })

      it('localStorage.setItem captures oldValue when key exists', () => {
        localStorage.setItem('foo', 'original')
        events = []
        localStorage.setItem('foo', 'updated')
        assert.equal(events.length, 1)
        const msg = events[0]!
        assert.equal(msg.oldValue, 'original')
        assert.equal(msg.newValue, 'updated')
      })

      it('localStorage.removeItem emits StorageMessage with removeItem operation', () => {
        localStorage.setItem('foo', 'bar')
        events = []
        localStorage.removeItem('foo')
        assert.equal(events.length, 1)
        const msg = events[0]!
        assert.equal(msg.storageType, StorageType.localStorage)
        assert.equal(msg.operation, StorageOperation.removeItem)
        assert.equal(msg.key, 'foo')
        assert.equal(msg.oldValue, 'bar')
        assert.equal(msg.newValue, null)
        assert.equal(msg.frameId, 0)
      })

      it('localStorage.clear emits StorageMessage with clear operation', () => {
        localStorage.clear()
        assert.equal(events.length, 1)
        const msg = events[0]!
        assert.equal(msg.storageType, StorageType.localStorage)
        assert.equal(msg.operation, StorageOperation.clear)
        assert.equal(msg.key, null)
        assert.equal(msg.oldValue, null)
        assert.equal(msg.newValue, null)
        assert.equal(msg.frameId, 0)
      })
    })

    // sessionStorage tests
    describe('sessionStorage', () => {
      it('sessionStorage.setItem emits StorageMessage with storageType=sessionStorage', () => {
        sessionStorage.setItem('baz', 'qux')
        assert.equal(events.length, 1)
        const msg = events[0]!
        assert.equal(msg.storageType, StorageType.sessionStorage)
        assert.equal(msg.operation, StorageOperation.setItem)
        assert.equal(msg.key, 'baz')
        assert.equal(msg.oldValue, null)
        assert.equal(msg.newValue, 'qux')
      })

      it('sessionStorage.removeItem emits StorageMessage with removeItem operation', () => {
        sessionStorage.setItem('baz', 'qux')
        events = []
        sessionStorage.removeItem('baz')
        assert.equal(events.length, 1)
        const msg = events[0]!
        assert.equal(msg.storageType, StorageType.sessionStorage)
        assert.equal(msg.operation, StorageOperation.removeItem)
        assert.equal(msg.key, 'baz')
        assert.equal(msg.oldValue, 'qux')
        assert.equal(msg.newValue, null)
      })

      it('sessionStorage.clear emits StorageMessage with clear operation', () => {
        sessionStorage.clear()
        assert.equal(events.length, 1)
        const msg = events[0]!
        assert.equal(msg.storageType, StorageType.sessionStorage)
        assert.equal(msg.operation, StorageOperation.clear)
        assert.equal(msg.key, null)
        assert.equal(msg.oldValue, null)
        assert.equal(msg.newValue, null)
      })
    })

    // Transparency tests
    it('proxy is transparent — setItem actually stores value', () => {
      localStorage.setItem('alpha', '1')
      assert.equal(localStorage.getItem('alpha'), '1')
    })

    it('proxy is transparent — removeItem actually removes value', () => {
      localStorage.setItem('beta', '2')
      localStorage.removeItem('beta')
      assert.equal(localStorage.getItem('beta'), null)
    })

    it('proxy is transparent — clear actually clears all values', () => {
      localStorage.setItem('x', '1')
      localStorage.setItem('y', '2')
      localStorage.clear()
      assert.equal(localStorage.getItem('x'), null)
      assert.equal(localStorage.getItem('y'), null)
    })
  })

  describe('after disconnect()', () => {
    it('restores original setItem/removeItem/clear methods (no longer the proxied versions)', () => {
      observer.observe(null as any, null as any)

      // Capture proxied methods (the ones installed by observe)
      const proxiedSetItem = localStorage.setItem
      const proxiedRemoveItem = localStorage.removeItem
      const proxiedClear = localStorage.clear

      observer.disconnect()

      // After disconnect, the proxied methods should no longer be installed
      assert.notEqual(localStorage.setItem, proxiedSetItem)
      assert.notEqual(localStorage.removeItem, proxiedRemoveItem)
      assert.notEqual(localStorage.clear, proxiedClear)
    })

    it('does not emit events after disconnect', () => {
      observer.observe(null as any, null as any)
      observer.disconnect()
      events = []
      localStorage.setItem('key', 'value')
      assert.equal(events.length, 0)
    })
  })
})
