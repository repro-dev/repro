import { CustomMark } from '@repro/domain'
import { ObserverLike } from '@repro/observer-utils'

type ReproExtension = {
  mark?: (name: string, data?: Record<string, unknown>) => void
  captureState?: (component: string, state: Record<string, unknown>) => void
  [key: string]: unknown
}

declare global {
  interface Window {
    __REPRO__?: ReproExtension
  }
}

function safeSerializeCustomMarkData(value: unknown) {
  try {
    const json = JSON.stringify(value)
    return json === undefined ? String(value) : json
  } catch {
    return String(value)
  }
}

export function createCustomMarkObserver(
  subscriber: (mark: CustomMark) => void
): ObserverLike {
  let createdExtension = false
  let installed = false
  let previousMark: ReproExtension['mark']

  return {
    observe() {
      if (installed) {
        return
      }

      const existing = window.__REPRO__
      const hadExtension = existing !== undefined
      const repro =
        existing && typeof existing === 'object'
          ? existing
          : (window.__REPRO__ = {})

      createdExtension = !hadExtension
      previousMark = typeof repro.mark === 'function' ? repro.mark : undefined

      repro.mark = (name: string, data?: Record<string, unknown>) => {
        previousMark?.call(repro, name, data)
        subscriber({
          name,
          data: data ? safeSerializeCustomMarkData(data) : null,
          frameId: 0,
        })
      }

      installed = true
    },

    disconnect() {
      if (!installed) {
        return
      }

      const repro = window.__REPRO__

      if (repro) {
        if (previousMark) {
          repro.mark = previousMark
        } else {
          delete repro.mark
        }

        if (createdExtension && Object.keys(repro).length === 0) {
          delete window.__REPRO__
        }
      }

      createdExtension = false
      installed = false
      previousMark = undefined
    },
  }
}
