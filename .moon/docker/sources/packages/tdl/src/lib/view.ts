import { decodeProperty, decodePropertyLazy } from './decoders'
import { AnyDescriptor } from './descriptors'
import { encodeProperty } from './encoders'

export interface Lens {
  __repro_IS_VIEW_LENS: true
  __repro_DATAVIEW: DataView
}

export function isLens(data: any): data is Lens {
  return (
    data !== undefined && data !== null && data.__repro_IS_VIEW_LENS === true
  )
}

export function unwrapLens(data: Lens) {
  return data.__repro_DATAVIEW
}

export interface View<D extends AnyDescriptor, T> {
  readonly descriptor: D
  encode(data: T): DataView
  decode(view: DataView | T): T
  from(data: T): T
  over(data: DataView): T
  nullable(): View<D & { nullable: true }, T | null>
  is(left: T, right: T): boolean
}

export function createView<D extends AnyDescriptor, T>(
  descriptor: D
): View<D, T> {
  function encode(data: T): DataView {
    if (isLens(data)) {
      // TODO: validate dataview bytecode/checksum/etc
      return unwrapLens(data)
    }

    return encodeProperty(descriptor, data)
  }

  function decode(view: DataView | T): T {
    let dataView: DataView

    if (isLens(view)) {
      dataView = unwrapLens(view)
    } else if (ArrayBuffer.isView(view)) {
      dataView = view
    } else {
      // No-op if view is already decoded
      return view as unknown as T
    }

    return decodeProperty(descriptor, dataView)
  }

  function from(data: T): T {
    return over(encode(data))
  }

  function over(view: DataView): T {
    // TODO: validate dataview bytecode/checksum/etc
    const data = decodePropertyLazy(descriptor, view)

    // Primitive types will have been fully decoded.
    // Calling `over` on them is equivalent to calling `decode`.
    if (data !== null && typeof data === 'object') {
      Object.defineProperty(data, '__repro_IS_VIEW_LENS', {
        value: true,
      })

      Object.defineProperty(data, '__repro_DATAVIEW', {
        value: view,
      })
    }

    return data
  }

  function nullable(): View<D & { nullable: true }, T | null> {
    return createView({ ...descriptor, nullable: true })
  }

  function is(left: T, right: T) {
    if (left === right) {
      return true
    }

    // Check if underlying DataViews are referentially equivalent
    if (encode(left) === encode(right)) {
      return true
    }

    return false
  }

  return {
    // Metadata
    descriptor,

    // Operations
    decode,
    encode,
    from,
    over,

    // Comparison
    is,

    // Transforms
    nullable,
  }
}
