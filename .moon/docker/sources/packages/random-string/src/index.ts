// Largely copied from nanoid/non-secure
// 1. Inlined due to compatibility problems between nanoid and jest
// 2. True cryptographic randomness not required for creating non-global identifiers

const alphabet =
  'useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict'

export function randomString(size = 21): string {
  let id = ''
  let i = size

  while (i--) {
    id += alphabet[(Math.random() * 64) | 0]
  }

  return id
}
