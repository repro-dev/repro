export function pairwise<T>(items: Array<T>): Array<[T | null, T | null]> {
  const pairs: Array<[T | null, T | null]> = []

  let prevItem: T | null = null
  let item: T | null = null

  for (let i = 0, len = items.length; i <= len; i++) {
    item = items[i] ?? null
    pairs.push([prevItem, item])
    prevItem = item
  }

  return pairs
}
