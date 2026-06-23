export type DetailLevel = 'summary' | 'normal' | 'full'

export interface TimeRangeParams {
  timeRangeStartMs?: number
  timeRangeEndMs?: number
}

export interface PaginationParams {
  limit?: number
}

export interface PaginatedResponse {
  hasMore?: boolean
  _hint?: string
}

export interface TokenEstimatedResponse {
  _tokenEstimate: number
}

// Heuristic: ~4 chars per token on average; ceil to avoid undercounting.
// This is only used for coarse budgeting (TOKEN_BUDGETS = 500/2000/8000) so
// a simple heuristic is sufficient — exact token counts aren't needed here.
export function estimateTokens(response: unknown): number {
  const text = JSON.stringify(response) ?? ''
  return Math.ceil(text.length / 4)
}

export function shortenStackFrame(frame: string): string {
  const match = frame.match(
    /([^/]+\.(?:tsx|jsx|mjs|cjs|ts|js))(?::(\d+)(?::(\d+))?)?/
  )
  if (match) {
    const parts = [match[1]]
    if (match[2]) parts.push(match[2])
    if (match[3]) parts.push(match[3])
    return parts.join(':')
  }
  return frame
}

export function shortenUrl(
  url: string,
  mode: 'pathname' | 'full' = 'pathname'
): string {
  if (mode === 'full') return url
  try {
    const parsed = new URL(url)
    return parsed.pathname + parsed.search
  } catch {
    return url
  }
}

export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str
  return str.slice(0, maxLength - 1) + '…'
}

export const TOKEN_BUDGETS = {
  summary: 500,
  normal: 2000,
  full: 8000,
} as const
