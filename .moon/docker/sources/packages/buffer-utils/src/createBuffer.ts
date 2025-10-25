import { copyArray } from '@repro/std'
import { approxByteLength } from '@repro/tdl'

export type Subscriber<T> = (value: T) => void

export type Unsubscribe = () => void

export interface Buffer<T> {
  clear(): void
  copy(): Array<T>
  peek(): T | null
  peekLast(): T | null
  push(entry: T): void
  onEvict(subscriber: Subscriber<Array<T>>): Unsubscribe
  onPush(subscriber: Subscriber<T>): Unsubscribe
}

export function createBuffer<T>(maxSizeInBytes: number): Buffer<T> {
  const buffer: Array<T> = []
  let size = 0

  let evicting = false

  const subscribers = {
    onEvict: new Set<Subscriber<Array<T>>>(),
    onPush: new Set<Subscriber<T>>(),
  }

  function scheduleEvictions() {
    evicting = true

    requestIdleCallback(() => {
      const evicted: Array<T> = []

      while (size > maxSizeInBytes) {
        const entry = buffer.shift()

        if (entry) {
          size -= approxByteLength(entry)
          evicted.push(entry)
        }
      }

      if (evicted.length) {
        for (const subscriber of subscribers.onEvict) {
          subscriber(evicted)
        }
      }

      evicting = false
    })
  }

  return {
    /**
     * Empty buffer.
     */
    clear() {
      while (buffer.length) {
        buffer.shift()
      }

      size = 0
    },

    /**
     * Create shallow copy of current buffer.
     */
    copy() {
      return copyArray(buffer)
    },

    /**
     * Read oldest entry from buffer, or null if empty.
     */
    peek() {
      return buffer[0] || null
    },

    /**
     * Read newest entry from buffer, or null if empty.
     */
    peekLast() {
      return buffer[buffer.length - 1] || null
    },

    /**
     * Append new entry to buffer.
     */
    push(entry) {
      buffer.push(entry)

      for (const subscriber of subscribers.onPush) {
        subscriber(entry)
      }

      size += approxByteLength(entry)

      if (!evicting) {
        scheduleEvictions()
      }
    },

    onEvict(subscriber) {
      subscribers.onEvict.add(subscriber)
      return () => subscribers.onEvict.delete(subscriber)
    },

    onPush(subscriber) {
      subscribers.onPush.add(subscriber)
      return () => subscribers.onPush.delete(subscriber)
    },
  }
}
