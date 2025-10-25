import { tap } from '@repro/future-utils'
import { FutureInstance, chain, parallel, promise, resolve } from 'fluture'
import { Fixture, FixtureArrayToValues, Services } from './types'

function loadAndCacheFixture(
  services: Services,
  cache: Map<Fixture<unknown>, unknown>
) {
  return function <T>(fixture: Fixture<T>): FutureInstance<Error, T> {
    return parallel(1)(
      fixture.dependencies.map(loadAndCacheFixture(services, cache))
    ).pipe(
      chain(values => {
        const cached = cache.get(fixture)
        if (cached != null) {
          return resolve(cached as T)
        }

        return fixture.load(services, ...values).pipe(
          tap(value => {
            cache.set(fixture, value)
          })
        )
      })
    )
  }
}

export function loadFixtures<T extends Array<Fixture<unknown>>>(
  services: Services,
  fixtures: [...T]
) {
  const cache = new Map<Fixture<unknown>, unknown>()
  return promise(
    parallel(1)(fixtures.map(loadAndCacheFixture(services, cache)))
  ) as Promise<FixtureArrayToValues<T>>
}
