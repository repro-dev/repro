export interface TimeGroup {
  /** Index of the first item in the group */
  startIndex: number
  /** Index of the last item in the group (inclusive) */
  endIndex: number
  /** Number of items in the group */
  count: number
  /** Time of the first item */
  startTime: number
  /** Time of the last item */
  endTime: number
}

/**
 * Group consecutive items in a time-ordered array by a sliding window.
 *
 * Algorithm: starting at each index i, walk forward accumulating items
 * whose time falls within `windowMs` of the anchor (items[i]). If the
 * accumulated count meets or exceeds `threshold`, emit a group and advance
 * i past the group. Otherwise advance i by 1.
 *
 * Items must be sorted by time (ascending) before calling.
 */
export function groupBySlidingWindow<T>(
  items: T[],
  getTime: (item: T) => number,
  windowMs: number,
  threshold: number
): TimeGroup[] {
  const groups: TimeGroup[] = []
  let i = 0
  while (i < items.length) {
    const anchor = items[i]!
    const anchorTime = getTime(anchor)
    let j = i
    while (j + 1 < items.length) {
      const nextTime = getTime(items[j + 1]!)
      if (nextTime - anchorTime > windowMs) break
      j++
    }
    const count = j - i + 1
    if (count >= threshold) {
      groups.push({
        startIndex: i,
        endIndex: j,
        count,
        startTime: anchorTime,
        endTime: getTime(items[j]!),
      })
      i = j + 1
    } else {
      i++
    }
  }
  return groups
}
