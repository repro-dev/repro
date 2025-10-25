import {
  ConsoleMessage,
  LogLevel,
  MessagePartType,
  StackEntry,
} from '@repro/domain'
import { ObserverLike } from '@repro/observer-utils'
import { Box } from '@repro/tdl'
import { isErrorLike, serializeError } from 'serialize-error'
import StackTrace, { StackTraceOptions } from 'stacktrace-js'
import { createVNode } from '../dom/factory'

// FIXME: `serialize-errors` chokes on enriched errors
// like `ApolloError`. We may want to write our own
// serialization layer. Pin max-depth as workaround.
const MAX_SERIALIZATION_DEPTH = 20

export function createConsoleObserver(
  subscriber: (message: ConsoleMessage) => void
): ObserverLike {
  const bind = Function.prototype.bind
  const log = bind.call(console.log, console)
  const info = bind.call(console.info, console)
  const warn = bind.call(console.warn, console)
  const error = bind.call(console.error, console)
  const debug = bind.call(console.debug, console)

  async function getStackEntries(error?: Error): Promise<Array<StackEntry>> {
    // TODO: find more robust way to exclude Repro from call stack
    const options: StackTraceOptions = {
      filter: frame =>
        !frame.fileName || !frame.fileName.startsWith('chrome-extension://'),
    }

    const frames = error
      ? StackTrace.fromError(error, options)
      : StackTrace.get(options)

    return (await frames).map(frame => ({
      functionName: frame.functionName || null,
      fileName: frame.fileName || '',
      lineNumber: frame.lineNumber || 0,
      columnNumber: frame.columnNumber || 0,
    }))
  }

  function safeSerialize(value: any) {
    try {
      if (isErrorLike(value)) {
        value = serializeError(value, { maxDepth: MAX_SERIALIZATION_DEPTH })
      }

      return JSON.stringify(value)
    } catch {
      return value.toString()
    }
  }

  function catchError(this: Window, ev: ErrorEvent) {
    ;(async function () {
      subscriber({
        level: LogLevel.Error,
        parts: [
          new Box({
            type: MessagePartType.String,
            value: safeSerialize(ev.message),
          }),
        ],
        stack: await getStackEntries(ev.error),
      })
    })()
  }

  function catchUnhandledRejection(this: Window, ev: PromiseRejectionEvent) {
    ;(async function () {
      subscriber({
        level: LogLevel.Error,
        parts: [
          new Box({
            type: MessagePartType.String,
            value: 'Uncaught (in promise)',
          }),
          new Box({
            type: MessagePartType.String,
            value: safeSerialize(ev.reason),
          }),
        ],
        stack: await getStackEntries(),
      })
    })()
  }

  function patchConsoleMethod(
    level: LogLevel,
    original: (...args: any[]) => void
  ) {
    return new Proxy(original, {
      apply(target, thisArg, args) {
        Reflect.apply(target, thisArg, args)
        ;(async function () {
          subscriber({
            level,
            parts: args.map(value => {
              if (typeof value === 'undefined') {
                return new Box({
                  type: MessagePartType.Undefined,
                })
              }

              if (value instanceof Node) {
                return new Box({
                  type: MessagePartType.Node,
                  node: createVNode(value),
                })
              }

              if (value instanceof Date) {
                return new Box({
                  type: MessagePartType.Date,
                  year: value.getUTCFullYear(),
                  month: value.getUTCMonth(),
                  day: value.getUTCDate(),
                  hour: value.getUTCHours(),
                  minute: value.getUTCMinutes(),
                  second: value.getUTCSeconds(),
                  millisecond: value.getUTCMilliseconds(),
                  timezoneOffset: value.getTimezoneOffset(),
                })
              }

              // TODO: serialize `Error` instances

              return new Box({
                type: MessagePartType.String,
                value: safeSerialize(value),
              })
            }),
            stack: await getStackEntries(),
          })
        })()
      },
    })
  }

  return {
    observe() {
      console.log = patchConsoleMethod(LogLevel.Info, log)
      console.info = patchConsoleMethod(LogLevel.Info, info)
      console.warn = patchConsoleMethod(LogLevel.Warning, warn)
      console.error = patchConsoleMethod(LogLevel.Error, error)
      console.debug = patchConsoleMethod(LogLevel.Verbose, debug)

      window.addEventListener('error', catchError)
      window.addEventListener('unhandledrejection', catchUnhandledRejection)
    },

    disconnect() {
      console.log = log
      console.info = info
      console.warn = warn
      console.error = error
      console.debug = debug

      window.removeEventListener('error', catchError)
      window.removeEventListener('unhandledrejection', catchUnhandledRejection)
    },
  }
}
