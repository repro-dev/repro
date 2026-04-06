import { FastifyRequest } from 'fastify'

export interface RateLimitConfig {
  unauthenticatedRpm: number
  authenticatedRpm: number
  uploadRpm: number
  // If provided, use Redis store; otherwise use in-memory
  redis?: unknown
}

/**
 * Derive rate-limit key for a request.
 *
 * - Authenticated requests (session.subjectId present): key by workspace/user ID
 *   so the per-workspace bucket is shared across all IPs for that workspace.
 * - Unauthenticated requests: key by IP address.
 */
function buildKeyGenerator(
  req: FastifyRequest,
  type: 'auth' | 'unauth'
): string {
  const session = (
    req as FastifyRequest & {
      session: { subjectId: string; id: string } | null
    }
  ).session

  if (type === 'auth' && session?.subjectId) {
    return `workspace:${session.subjectId}`
  }

  return `ip:${req.ip}`
}

/**
 * Build @fastify/rate-limit plugin options for global rate limiting.
 *
 * Caller is responsible for calling `app.register(rateLimit, buildRateLimitOptions(config))`
 * at the top-level Fastify scope — NOT inside a child plugin — so that global:true
 * applies to all routes regardless of encapsulation boundaries.
 *
 * Behaviour:
 * - Unauthenticated (no session): `unauthenticatedRpm` per IP per minute.
 * - Authenticated (session present): `authenticatedRpm` per workspace per minute.
 * - /health and /metrics are skipped entirely.
 * - 429 responses include Retry-After header and JSON body
 *   `{ error: "rate_limit_exceeded", retryAfter: <seconds> }`.
 * - Each limit hit emits a structured log line with workspace_id, endpoint, limit_type.
 */
export function buildRateLimitOptions(config: RateLimitConfig) {
  const { unauthenticatedRpm, authenticatedRpm, redis } = config

  return {
    global: true,
    ...(redis ? { redis } : {}),
    // Dynamic max: authenticated requests get a higher limit than unauthenticated.
    max: (req: FastifyRequest, _key: string) => {
      const session = (
        req as FastifyRequest & {
          session: { subjectId: string; id: string } | null
        }
      ).session
      return session?.subjectId != null ? authenticatedRpm : unauthenticatedRpm
    },
    timeWindow: '1 minute' as const,
    // Use workspace ID for authenticated requests, IP for unauthenticated.
    keyGenerator: (req: FastifyRequest) => {
      const session = (
        req as FastifyRequest & {
          session: { subjectId: string; id: string } | null
        }
      ).session
      return session?.subjectId
        ? buildKeyGenerator(req, 'auth')
        : buildKeyGenerator(req, 'unauth')
    },
    // Skip rate limiting for health and metrics endpoints.
    allowList: (req: FastifyRequest) =>
      req.routeOptions?.url === '/health' ||
      req.routeOptions?.url === '/metrics',
    // Emit structured log on each rate limit hit.
    onExceeded: (req: FastifyRequest, key: string) => {
      const session = (
        req as FastifyRequest & {
          session: { subjectId: string; id: string } | null
        }
      ).session
      const isAuthenticated = session?.subjectId != null
      req.log.warn(
        {
          workspace_id: session?.subjectId ?? null,
          endpoint: req.routeOptions?.url ?? req.url,
          limit_type: isAuthenticated ? 'authenticated' : 'unauthenticated',
          key,
        },
        'rate_limit_exceeded'
      )
    },
    // Custom 429 response: { error: "rate_limit_exceeded", retryAfter: <seconds> }
    errorResponseBuilder: (_req: FastifyRequest, context: { ttl: number }) => ({
      statusCode: 429,
      error: 'rate_limit_exceeded',
      retryAfter: context.ttl,
    }),
    addHeaders: {
      'retry-after': true as const,
    },
  }
}

/**
 * Build per-route rate limit options for the recording upload endpoints.
 * This applies a stricter bucket (`uploadRpm`) scoped to the workspace.
 */
export function uploadRateLimitOptions(uploadRpm: number) {
  return {
    max: uploadRpm,
    timeWindow: '1 minute' as const,
    keyGenerator: (req: FastifyRequest) => {
      const session = (
        req as FastifyRequest & {
          session: { subjectId: string; id: string } | null
        }
      ).session
      return session?.subjectId
        ? `upload:workspace:${session.subjectId}`
        : `upload:ip:${req.ip}`
    },
    onExceeded: (req: FastifyRequest, key: string) => {
      const session = (
        req as FastifyRequest & {
          session: { subjectId: string; id: string } | null
        }
      ).session
      req.log.warn(
        {
          workspace_id: session?.subjectId ?? null,
          endpoint: req.routeOptions?.url ?? req.url,
          limit_type: 'upload',
          key,
        },
        'rate_limit_exceeded'
      )
    },
    errorResponseBuilder: (_req: FastifyRequest, context: { ttl: number }) => ({
      statusCode: 429,
      error: 'rate_limit_exceeded',
      retryAfter: context.ttl,
    }),
    addHeaders: {
      'retry-after': true as const,
    },
  }
}
