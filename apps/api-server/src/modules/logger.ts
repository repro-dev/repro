import { FastifyInstance } from 'fastify'

export type LogPayload = Record<string, unknown> | Error | string

export type ApiLogMethod = (
  payload: LogPayload,
  message?: string,
  ...args: Array<unknown>
) => void

export interface ApiLogger {
  trace: ApiLogMethod
  debug: ApiLogMethod
  info: ApiLogMethod
  warn: ApiLogMethod
  error: ApiLogMethod
  fatal: ApiLogMethod
  child(bindings: Record<string, unknown>): ApiLogger
}

const noopLogMethod: ApiLogMethod = () => {}

export const noopLogger: ApiLogger = {
  trace: noopLogMethod,
  debug: noopLogMethod,
  info: noopLogMethod,
  warn: noopLogMethod,
  error: noopLogMethod,
  fatal: noopLogMethod,
  child: () => noopLogger,
}

export function createFastifyLoggerOptions({
  nodeEnv = 'development',
}: {
  nodeEnv?: 'development' | 'test' | 'production'
} = {}) {
  return {
    level: nodeEnv === 'test' ? 'silent' : 'info',
    redact: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.body.password',
      'req.body.newPassword',
      'req.body.token',
      'req.body.sessionToken',
      'req.body.verificationToken',
      'req.body.invitationToken',
      'req.body.resetToken',
      'req.body.secret',
      'req.body.clientSecret',
      'req.body.webhookSecret',
      'res.headers["set-cookie"]',
    ],
  }
}

type RequestWithCorrelation = {
  id: string
  method: string
  url: string
  routeOptions?: { url?: string }
  headers?: Record<string, unknown>
  session?: { subjectType: string; subjectId: string } | null
  user?: { type: string; id: string; email?: unknown } | null
}

export function createRequestLogContext(req: RequestWithCorrelation) {
  const route = req.routeOptions?.url ?? req.url.split('?')[0]
  const context: Record<string, unknown> = {
    requestId: req.id,
    method: req.method,
    route,
  }

  if (req.session != null) {
    context.sessionSubjectType = req.session.subjectType
    context.sessionSubjectId = req.session.subjectId
  }

  if (req.user != null) {
    if (req.user.type === 'staff') {
      context.staffUserId = req.user.id
    } else {
      context.userId = req.user.id
    }
  }

  return context
}

export function registerRequestLoggingHooks(
  app: FastifyInstance<any, any, any, any, any>
) {
  app.addHook('onRequest', (req, _res, done) => {
    req.log.info(
      { event: 'http.request.start', ...createRequestLogContext(req) },
      'HTTP request started'
    )
    done()
  })

  app.addHook('onResponse', (req, res, done) => {
    req.log.info(
      {
        event: 'http.request.complete',
        ...createRequestLogContext(req),
        statusCode: res.statusCode,
      },
      'HTTP request completed'
    )
    done()
  })

  app.addHook('onError', (req, _res, err, done) => {
    req.log.error(
      { event: 'http.request.error', ...createRequestLogContext(req), err },
      'HTTP request failed'
    )
    done()
  })
}
