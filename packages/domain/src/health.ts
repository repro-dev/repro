export type SubsystemStatus = 'ok' | 'error' | 'degraded'

export interface SubsystemCheck {
  status: SubsystemStatus
  latencyMs?: number
  error?: string
  details?: Record<string, unknown>
}

export type OverallStatus = 'ok' | 'degraded' | 'unhealthy'

export interface HealthCheckResult {
  status: OverallStatus
  timestamp: string
  checks: {
    database: SubsystemCheck
    storage: SubsystemCheck
    redis?: SubsystemCheck // optional — omitted if not configured
    outbox?: SubsystemCheck // optional — omitted if not configured
  }
}
