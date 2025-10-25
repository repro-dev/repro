import { FutureInstance, attemptP, chain, reject, resolve } from 'fluture'
import localForage from 'localforage'

export interface AuthStore {
  getSessionToken(): FutureInstance<Error, string>
  setSessionToken(token: string): FutureInstance<Error, string>
  clearSessionToken(): FutureInstance<Error, void>
}

// TODO: Cookie-based auth storage

export function createLocalStorageAuthStore(): AuthStore {
  const KEY = 'repro-session'

  function getSessionToken(): FutureInstance<Error, string> {
    return attemptP<Error, string | null>(() =>
      localForage.getItem<string>(KEY)
    ).pipe(
      chain(token => (token === null ? reject(new Error()) : resolve(token)))
    )
  }

  function setSessionToken(token: string): FutureInstance<Error, string> {
    return attemptP(() => localForage.setItem<string>(KEY, token))
  }

  function clearSessionToken(): FutureInstance<Error, void> {
    return attemptP(() => localForage.removeItem(KEY))
  }

  return {
    getSessionToken,
    setSessionToken,
    clearSessionToken,
  }
}

export function createInMemoryAuthStore(): AuthStore {
  let storedToken: string | null = null

  function getSessionToken(): FutureInstance<Error, string> {
    return storedToken === null ? reject(new Error()) : resolve(storedToken)
  }

  function setSessionToken(token: string): FutureInstance<Error, string> {
    storedToken = token
    return resolve(storedToken)
  }

  function clearSessionToken(): FutureInstance<Error, void> {
    storedToken = null
    return resolve(undefined)
  }

  return {
    getSessionToken,
    setSessionToken,
    clearSessionToken,
  }
}
