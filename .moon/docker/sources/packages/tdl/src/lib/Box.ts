export class Box<T> {
  // FIXME: correctly infer types here
  public static from<T>(value: T | null) {
    return value instanceof Box ? value : new Box(value)
  }

  constructor(private value: T | null) {}

  empty(): this is this & { value: null } {
    return this.value == null
  }

  unwrap(): T {
    if (this.value == null) {
      throw new Error('Cannot unwrap boxed value: empty')
    }

    return this.value
  }

  get<K extends keyof T>(key: K): Box<T[K]> {
    return this.map(value => value[key])
  }

  orElse<U>(other: U): T | U {
    return this.value == null ? other : this.value
  }

  apply(fn: (value: T) => void) {
    if (this.value != null) {
      fn(this.value)
    }
  }

  filter<U extends T>(predicate: (value: T) => boolean): Box<U> {
    if (this.value && predicate(this.value)) {
      return new Box(this.value as U)
    }

    return new Box<U>(null)
  }

  map<R>(mapper: (value: T) => R): Box<R> {
    return new Box(this.value != null ? mapper(this.value) : null)
  }

  flat() {
    // FIXME: fix type inference
    return this.value instanceof Box ? this.value : this
  }

  flatMap<R extends Box<any>>(mapper: (value: T) => R | null | undefined): R {
    if (this.value == null) {
      return new Box(null) as R
    }

    return mapper(this.value) ?? (new Box(null) as R)
  }

  match(predicate: (value: T) => boolean): boolean {
    return this.map(predicate).orElse(false)
  }

  equals(other: Box<any>): boolean {
    return this.value === other.value
  }
}

type Primitive =
  | number
  | string
  | boolean
  | symbol
  | undefined
  | null
  | void
  | Function
  | Date
  | ArrayBuffer

export type DeeplyUnboxed<T> = T extends Primitive
  ? T
  : T extends Box<infer U>
  ? DeeplyUnboxed<U>
  : T extends object
  ? { [K in keyof T]: DeeplyUnboxed<T[K]> }
  : T

export type Unboxed<T> = T extends Box<infer U> ? U : T
