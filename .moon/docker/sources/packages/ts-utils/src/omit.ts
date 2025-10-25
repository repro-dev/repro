type UnionOmit<T, K extends string | number | symbol> = T extends unknown
  ? Omit<T, K>
  : never

type NullUnionOmit<T, K extends string | number | symbol> = null extends T
  ? UnionOmit<NonNullable<T>, K>
  : UnionOmit<T, K>

type RecursiveOmitHelper<T, K extends string | number | symbol> = {
  [P in keyof T]: RecursiveOmit<T[P], K>
}

export type RecursiveOmit<T, K extends string | number | symbol> = T extends {
  [P in K]: any
}
  ? NullUnionOmit<RecursiveOmitHelper<T, K>, K>
  : RecursiveOmitHelper<T, K>
