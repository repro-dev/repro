import { Point } from '@repro/domain'

import { copyArray } from '@repro/std'
import { Box } from '@repro/tdl'

export function isSample(data: Box<object>): data is Box<Sample<any>> {
  return data.match(
    data => 'from' in data && 'to' in data && 'duration' in data
  )
}

export interface Sample<T> {
  from: T
  to: T
  duration: number
}

export function interpolatePointFromSample(
  sample: Sample<Point>,
  time: number,
  elapsed: number
): Point {
  const { duration, from: fromValue, to: toValue } = sample

  // If sample window has already expired or duration is 0, jump to end value
  if (time + duration < elapsed || duration === 0) {
    return copyArray(toValue) as Point
  } else {
    const adjustment = (elapsed - time) / duration

    const offsetValue: Point = [
      fromValue[0] + (toValue[0] - fromValue[0]) * adjustment,
      fromValue[1] + (toValue[1] - fromValue[1]) * adjustment,
    ]

    return offsetValue
  }
}
