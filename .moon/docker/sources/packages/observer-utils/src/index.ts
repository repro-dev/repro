import { VTree } from '@repro/domain'

export interface ObserverLike<T extends any = any> {
  disconnect(): void
  observe(target: T, vtree: VTree): void
}

export function createEventObserver<
  K extends keyof GlobalEventHandlersEventMap,
>(
  type: K,
  listener: (
    this: GlobalEventHandlers,
    evt: GlobalEventHandlersEventMap[K]
  ) => void
): ObserverLike<GlobalEventHandlers>

export function createEventObserver<
  K extends keyof WindowEventHandlersEventMap,
>(
  type: K,
  listener: (
    this: WindowEventHandlers,
    ev: WindowEventHandlersEventMap[K]
  ) => void
): ObserverLike<WindowEventHandlers>

export function createEventObserver(
  type: string,
  listener: (ev: Event) => void
): ObserverLike {
  const listenerMap = new Map<any, Array<typeof listener>>()

  return {
    disconnect() {
      for (const [target, listeners] of listenerMap) {
        for (const listener of listeners) {
          target.removeEventListener(type, listener, true)
          listenerMap.delete(target)
        }
      }
    },

    observe(target) {
      target.addEventListener(type, listener, {
        capture: true,
        passive: true,
      })

      if (!listenerMap.has(target)) {
        listenerMap.set(target, [])
      }

      listenerMap.get(target)?.push(listener)
    },
  }
}
