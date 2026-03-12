import { ListResponse } from '@repro/domain'

export function toListResponse<T>(items: Array<T>): ListResponse<T> {
  return { items }
}
