import { Cancel, chain, fork, FutureInstance, map, mapRej } from 'fluture'
import { useEffect, useRef, useState } from 'react'
import { Observable } from 'rxjs'

interface ResolvedFuture<R> {
  success: true
  loading: false
  error: null
  data: R

  /* @deprecated */
  result: R
}

interface RejectedFuture<L> {
  success: false
  loading: false
  error: L
  data: null

  /* @deprecated */
  result: null
}

interface PendingFuture {
  success: false
  loading: true
  error: null
  data: null

  /* @deprecated */
  result: null
}

type FutureResult<L, R> = PendingFuture | ResolvedFuture<R> | RejectedFuture<L>

export function useFuture<L, R>(
  factory: () => FutureInstance<L, R>,
  deps: Array<any>
): FutureResult<L, R> {
  const initialized = useRef(false)
  const [future, setFuture] = useState(factory)

  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<R | null>(null)
  const [error, setError] = useState<L | null>(null)

  useEffect(() => {
    if (initialized.current) {
      setFuture(factory())
    }
  }, [initialized, setFuture, ...deps])

  useEffect(() => {
    initialized.current = true

    setError(null)
    setData(null)
    setLoading(true)

    return future.pipe(
      fork<L>(err => {
        setError(err)
        setLoading(false)
      })<R>(res => {
        setData(res)
        setLoading(false)
      })
    )
  }, [future, setError, setLoading, setData])

  return {
    success: !loading && !!data,
    loading,
    error,
    data,
    result: data,
  } as FutureResult<L, R>
}

export function observeFuture<L, R>(fut: FutureInstance<L, R>): Observable<R> {
  return new Observable(observer => {
    return fork(observer.error.bind(observer))(observer.next.bind(observer))(
      fut
    )
  })
}

export function tap<L, R>(
  fn: (value: R) => void
): (source: FutureInstance<L, R>) => FutureInstance<L, R> {
  return function (source) {
    return source.pipe(
      map(value => {
        fn(value)
        return value
      })
    )
  }
}

export function tapF<L, R>(
  fn: (value: R) => FutureInstance<L, unknown>
): (source: FutureInstance<L, R>) => FutureInstance<L, R> {
  return function (source) {
    return source.pipe(chain(value => fn(value).pipe(map(() => value))))
  }
}

export function tapRej<L, R>(
  fn: (reason: L) => void
): (source: FutureInstance<L, R>) => FutureInstance<L, R> {
  return function (source) {
    return source.pipe(
      mapRej(reason => {
        fn(reason)
        return reason
      })
    )
  }
}

export function forget<L, R>(fut: FutureInstance<L, R>): Cancel {
  const noop = () => void 0
  return fork(noop)(noop)(fut)
}
