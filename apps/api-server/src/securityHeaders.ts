import type { FastifyHelmetOptions } from '@fastify/helmet'

export function buildHelmetOptions(options?: {
  isProduction?: boolean
}): FastifyHelmetOptions {
  return {
    hsts: options?.isProduction
      ? { maxAge: 31536000, includeSubDomains: true }
      : false,
    frameguard: { action: 'deny' },
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginResourcePolicy: false,
  }
}
