import { logger } from '@repro/logger'

export enum StatsLevel {
  Log = 0,
  Debug = 1,
}

let enabled = false
let statsLevel: StatsLevel = StatsLevel.Log

type FactoryOrValue<T> = T | (() => T)

interface SampleRecord {
  min: number
  max: number
  total: number
  entries: number
}

function createEmptySampleRecord(): SampleRecord {
  return {
    min: Infinity,
    max: -Infinity,
    total: 0,
    entries: 0,
  }
}

let sampling = false

const samples: Record<string, SampleRecord> = {}

function awaitSample() {
  requestIdleCallback(() => {
    for (const [label, record] of Object.entries(samples)) {
      emit(`(sample [${record.entries}]) ${label}`, [
        record.min,
        record.total / record.entries,
        record.max,
      ])
      delete samples[label]
    }

    sampling = false
  })
}

function emit<T>(label: string, value: T) {
  logger.debug(label, value)
}

type AnyFunction = (...args: any[]) => any

export const Stats = {
  enable() {
    enabled = true
  },

  disable() {
    enabled = false
  },

  setLevel(level: StatsLevel) {
    statsLevel = level
  },

  value(label: string, value: FactoryOrValue<number>, level = StatsLevel.Log) {
    if (enabled && level <= statsLevel) {
      emit(`(value) ${label}`, typeof value === 'function' ? value() : value)
    }
  },

  sample(label: string, value: FactoryOrValue<number>, level = StatsLevel.Log) {
    if (enabled && level < statsLevel) {
      label = `(sample) ${label}`
      let record = samples[label]

      if (!record) {
        record = createEmptySampleRecord()
        samples[label] = record
      }

      const entry = typeof value === 'function' ? value() : value

      if (entry < record.min) {
        record.min = entry
      }

      if (entry > record.max) {
        record.max = entry
      }

      record.total += entry
      record.entries += 1

      if (!sampling) {
        sampling = true
        awaitSample()
      }
    }
  },

  time<T extends AnyFunction>(
    label: string,
    fn: T,
    level = StatsLevel.Log
  ): ReturnType<T> {
    if (!enabled || level > statsLevel) {
      return fn()
    }

    const start = performance.now()
    const result = fn()
    emit(`(time) ${label}`, performance.now() - start)
    return result
  },

  timeMean<T extends AnyFunction>(
    label: string,
    fn: T,
    level = StatsLevel.Log
  ): ReturnType<T> {
    if (!enabled || level > statsLevel) {
      return fn()
    }

    const start = performance.now()
    const result = fn()
    this.sample(label, performance.now() - start)
    return result
  },
}
