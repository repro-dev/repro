import expect from 'expect'
import Future, { reject, resolve } from 'fluture'
import { afterEach, describe, it, mock } from 'node:test'
import {
  createExpiredSessionCleanupRunner,
  startExpiredSessionCleanup,
} from './sessionCleanup'

describe('Expired session cleanup', () => {
  afterEach(() => {
    mock.reset()
    mock.timers.reset()
  })

  it('does not overlap cleanup runs while a previous run is still in flight', () => {
    let runCount = 0
    let resolveCleanup: ((value: number) => void) | undefined

    const runCleanup = createExpiredSessionCleanupRunner(
      {
        deleteExpiredSessions: () => {
          runCount += 1

          return Future((_reject, resolveResult) => {
            resolveCleanup = resolveResult
            return () => {}
          })
        },
      },
      { error: mock.fn() }
    )

    runCleanup()
    runCleanup()

    expect(runCount).toEqual(1)

    resolveCleanup?.(1)
    runCleanup()

    expect(runCount).toEqual(2)
  })

  it('logs cleanup failures with the app logger', () => {
    const error = new Error('cleanup failed')
    const logger = { error: mock.fn() }

    const runCleanup = createExpiredSessionCleanupRunner(
      {
        deleteExpiredSessions: () => reject(error),
      },
      logger
    )

    runCleanup()

    expect(logger.error.mock.callCount()).toEqual(1)
    expect(logger.error.mock.calls[0]?.arguments[0]).toEqual({ err: error })
    expect(logger.error.mock.calls[0]?.arguments[1]).toEqual(
      'Expired session cleanup failed'
    )
  })

  it('schedules cleanup using the configured interval', () => {
    mock.timers.enable({ apis: ['setInterval'] })

    let runCount = 0

    const cleanupInterval = startExpiredSessionCleanup(
      {
        deleteExpiredSessions: () => {
          runCount += 1
          return resolve(0)
        },
      },
      { error: mock.fn() },
      5
    )

    mock.timers.tick(4999)
    expect(runCount).toEqual(0)

    mock.timers.tick(1)
    expect(runCount).toEqual(1)

    clearInterval(cleanupInterval)
    mock.timers.tick(5000)
    expect(runCount).toEqual(1)
  })
})
