type KeySelectorFn<T> = (input: T) => string
type MapFn<T, R> = (input: T) => R
type SampleFn<T> = (value: T, duration: number) => void

interface SamplingRecord<T> {
  startTime: number
  lastValue: T
  duration: number
}

export function sampleEventsByKey<T extends Event, R>(
  keySelector: KeySelectorFn<T>,
  map: MapFn<T, R>,
  sample: SampleFn<R>,
  maxSampleWindowMs: number
) {
  const samplingRecords = new Map<string, SamplingRecord<R>>()

  return function (this: GlobalEventHandlers, ev: T) {
    const time = performance.now()
    const key = keySelector(ev)
    const value = map(ev)

    let samplingRecord = samplingRecords.get(key)

    if (!samplingRecord) {
      samplingRecord = {
        startTime: time,
        lastValue: value,
        duration: 0,
      }

      samplingRecords.set(key, samplingRecord)

      setTimeout(function () {
        const samplingRecord = samplingRecords.get(key)

        if (samplingRecord) {
          sample(samplingRecord.lastValue, samplingRecord.duration)
        }

        samplingRecords.delete(key)
      }, maxSampleWindowMs)
    }

    samplingRecord.lastValue = value
    samplingRecord.duration = time - samplingRecord.startTime
  }
}
