import { Cancel, fork, FutureInstance, promise } from 'fluture'
import {
  AuthStore,
  createInMemoryAuthStore,
  createLocalStorageAuthStore,
} from './auth'
import { createFetch } from './fetch'
import { ApiConfiguration, Fetch } from './types'

export interface ApiClient {
  authStore: AuthStore
  fetch: Fetch
  debug: <R>(method: FutureInstance<unknown, R>) => Cancel
  wrapP: <R>(method: FutureInstance<unknown, R>) => Promise<R>
}

export function createApiClient(config: ApiConfiguration): ApiClient {
  const authStore =
    config.authStorage === 'local-storage'
      ? createLocalStorageAuthStore()
      : createInMemoryAuthStore()
  const fetch = createFetch(authStore, config)

  function debug<R>(method: FutureInstance<unknown, R>) {
    return method.pipe(fork<unknown>(console.error)<R>(console.log))
  }

  function wrapP<R>(method: FutureInstance<unknown, R>) {
    return (method as FutureInstance<Error, R>).pipe(promise)
  }

  return {
    authStore,
    fetch,
    debug,
    wrapP,
  }
}

export const defaultClient = createApiClient({
  baseUrl: process.env.REPRO_API_URL || '',
  authStorage: (process.env.AUTH_STORAGE as any) || 'local-storage',
})
