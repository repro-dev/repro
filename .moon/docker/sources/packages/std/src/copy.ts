import { Box } from '@repro/tdl'

export const copyArray = <T>(arr: Array<T>) => arr.slice()
export const copyObject = <T extends object>(obj: T): T => ({ ...obj })

// FIXME: This does not work in cases where obj contains `Box<T>`
//export const copyObjectDeep = <T extends object>(obj: T): T =>
//  JSON.parse(JSON.stringify(obj))

export const copyObjectDeep = <T extends object>(obj: T): T => {
  function replacer(_: string, value: any) {
    if (value instanceof Box) {
      return {
        '#typeof': 'Box',
        value: value.orElse(null),
      }
    }

    return value
  }

  function reviver(_: string, value: any) {
    if (
      value != null &&
      typeof value === 'object' &&
      '#typeof' in value &&
      value['#typeof'] === 'Box'
    ) {
      return new Box(value.value)
    }

    return value
  }

  return JSON.parse(JSON.stringify(obj, replacer), reviver)
}
