export interface RecordingQueryParams {
  q?: string
  startDate?: string
  endDate?: string
  browser?: string
  minDuration?: number
  maxDuration?: number
  limit?: number
  offset?: number
  orderBy?: 'createdAt' | 'duration'
}
