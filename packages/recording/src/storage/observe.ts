import { StorageMessage, StorageOperation, StorageType } from '@repro/domain'
import { ObserverLike } from '@repro/observer-utils'

export function createStorageObserver(
  subscriber: (message: StorageMessage) => void
): ObserverLike {
  // Capture original methods once during construction so teardown is always
  // possible even if storage becomes unavailable later.
  let localSetItem: ((key: string, value: string) => void) | null = null
  let localRemoveItem: ((key: string) => void) | null = null
  let localClear: (() => void) | null = null
  let sessionSetItem: ((key: string, value: string) => void) | null = null
  let sessionRemoveItem: ((key: string) => void) | null = null
  let sessionClear: (() => void) | null = null

  try {
    localSetItem = localStorage.setItem.bind(localStorage)
    localRemoveItem = localStorage.removeItem.bind(localStorage)
    localClear = localStorage.clear.bind(localStorage)
  } catch {
    // localStorage unavailable (e.g. browser privacy settings)
  }

  try {
    sessionSetItem = sessionStorage.setItem.bind(sessionStorage)
    sessionRemoveItem = sessionStorage.removeItem.bind(sessionStorage)
    sessionClear = sessionStorage.clear.bind(sessionStorage)
  } catch {
    // sessionStorage unavailable
  }

  function emitStorageMessage(
    storageType: StorageType,
    operation: StorageOperation,
    key: string | null,
    oldValue: string | null,
    newValue: string | null
  ) {
    subscriber({
      storageType,
      operation,
      key,
      oldValue,
      newValue,
      frameId: 0,
    })
  }

  return {
    observe() {
      // Proxy localStorage methods
      if (localSetItem && localRemoveItem && localClear) {
        const _localSetItem = localSetItem
        const _localRemoveItem = localRemoveItem
        const _localClear = localClear

        try {
          // Use getItem bound to localStorage for reading oldValue
          const localGetItem = localStorage.getItem.bind(localStorage)

          globalThis.localStorage.setItem = function (
            key: string,
            value: string
          ) {
            const oldValue = localGetItem(key)
            _localSetItem(key, value)
            emitStorageMessage(
              StorageType.localStorage,
              StorageOperation.setItem,
              key,
              oldValue,
              value
            )
          }

          globalThis.localStorage.removeItem = function (key: string) {
            const oldValue = localGetItem(key)
            _localRemoveItem(key)
            emitStorageMessage(
              StorageType.localStorage,
              StorageOperation.removeItem,
              key,
              oldValue,
              null
            )
          }

          globalThis.localStorage.clear = function () {
            _localClear()
            emitStorageMessage(
              StorageType.localStorage,
              StorageOperation.clear,
              null,
              null,
              null
            )
          }
        } catch {
          // Cannot install proxy (e.g. storage access denied)
        }
      }

      // Proxy sessionStorage methods
      if (sessionSetItem && sessionRemoveItem && sessionClear) {
        const _sessionSetItem = sessionSetItem
        const _sessionRemoveItem = sessionRemoveItem
        const _sessionClear = sessionClear

        try {
          const sessionGetItem = sessionStorage.getItem.bind(sessionStorage)

          globalThis.sessionStorage.setItem = function (
            key: string,
            value: string
          ) {
            const oldValue = sessionGetItem(key)
            _sessionSetItem(key, value)
            emitStorageMessage(
              StorageType.sessionStorage,
              StorageOperation.setItem,
              key,
              oldValue,
              value
            )
          }

          globalThis.sessionStorage.removeItem = function (key: string) {
            const oldValue = sessionGetItem(key)
            _sessionRemoveItem(key)
            emitStorageMessage(
              StorageType.sessionStorage,
              StorageOperation.removeItem,
              key,
              oldValue,
              null
            )
          }

          globalThis.sessionStorage.clear = function () {
            _sessionClear()
            emitStorageMessage(
              StorageType.sessionStorage,
              StorageOperation.clear,
              null,
              null,
              null
            )
          }
        } catch {
          // Cannot install proxy
        }
      }
    },

    disconnect() {
      // Restore original localStorage methods
      if (localSetItem && localRemoveItem && localClear) {
        try {
          globalThis.localStorage.setItem = localSetItem
          globalThis.localStorage.removeItem = localRemoveItem
          globalThis.localStorage.clear = localClear
        } catch {
          // Cannot restore (storage no longer accessible)
        }
      }

      // Restore original sessionStorage methods
      if (sessionSetItem && sessionRemoveItem && sessionClear) {
        try {
          globalThis.sessionStorage.setItem = sessionSetItem
          globalThis.sessionStorage.removeItem = sessionRemoveItem
          globalThis.sessionStorage.clear = sessionClear
        } catch {
          // Cannot restore
        }
      }
    },
  }
}
