import { FutureInstance } from 'fluture'

export interface ApiConfiguration {
  baseUrl: string
  authStorage: 'memory' | 'local-storage'
}

type Method =
  | 'connect'
  | 'delete'
  | 'get'
  | 'head'
  | 'options'
  | 'patch'
  | 'post'
  | 'put'

export interface FetchOptions {
  method?: Method | Uppercase<Method>
  headers?: Record<string, string>
  body?: XMLHttpRequestBodyInit
}

export type Fetch = <R = any>(
  url: string,
  options?: FetchOptions,

  // FIXME: Deprecate `requestType` and `responseType`
  requestType?: 'json' | 'binary',
  responseType?: 'auto' | 'json' | 'binary' | 'text' | 'stream'
) => FutureInstance<Error, R>
