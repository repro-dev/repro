export interface ListResponse<T> {
  items: Array<T>
}

export interface PaginatedResponse<T> {
  items: Array<T>
  nextCursor?: string
}
