import { createBinaryWireFormatSource } from './createBinaryWireFormatSource'
import { Source } from './types'

export function createFixtureSource(fileName: string): Source {
  return createBinaryWireFormatSource(
    fetch(fileName).then(res => {
      if (!res.body) {
        throw new Error(`Fixture ${fileName} did not include a response body`)
      }

      return res.body
    })
  )
}
