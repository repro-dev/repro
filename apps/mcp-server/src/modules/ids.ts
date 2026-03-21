import Sqids from 'sqids'

const sqids = new Sqids({
  alphabet: 'ELR7gGeX6QBJtykFzaAjixmP4of8uhNYDOVH02T1nI9MrUSCvW3KZqsplc5dwb',
  minLength: 7,
})

export function encodeId(id: number): string {
  return sqids.encode([id])
}

export function decodeId(id: string): number | null {
  return sqids.decode(id)[0] ?? null
}
