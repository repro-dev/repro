import helmet from '@fastify/helmet'
import expect from 'expect'
import fastify from 'fastify'
import {
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod'
import { describe, it } from 'node:test'
import { buildHelmetOptions } from '~/securityHeaders'

// Build a minimal test app with helmet registered (without isProduction flag,
// matching what the test harness uses via fromRouter).
async function buildTestApp() {
  const app = fastify()

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  // Register helmet with no isProduction flag — same as test harness.
  app.register(helmet, buildHelmetOptions())

  // A simple test endpoint so we can make a real request and inspect headers.
  app.get('/test', async (_req, res) => {
    res.status(200).send({ ok: true })
  })

  await app.ready()
  return app
}

describe('Security headers (buildHelmetOptions)', () => {
  describe('headers present on all responses', () => {
    it('should set x-content-type-options: nosniff', async () => {
      const app = await buildTestApp()
      const res = await app.inject({ method: 'GET', url: '/test' })
      expect(res.headers['x-content-type-options']).toEqual('nosniff')
      await app.close()
    })

    it('should set x-frame-options: DENY', async () => {
      const app = await buildTestApp()
      const res = await app.inject({ method: 'GET', url: '/test' })
      expect(res.headers['x-frame-options']).toEqual('DENY')
      await app.close()
    })

    it('should set content-security-policy header', async () => {
      const app = await buildTestApp()
      const res = await app.inject({ method: 'GET', url: '/test' })
      expect(res.headers['content-security-policy']).toBeDefined()
      await app.close()
    })
  })

  describe('HSTS absent without isProduction flag', () => {
    it('should NOT set strict-transport-security when isProduction is not set', async () => {
      const app = await buildTestApp()
      const res = await app.inject({ method: 'GET', url: '/test' })
      expect(res.headers['strict-transport-security']).toBeUndefined()
      await app.close()
    })
  })

  describe('HSTS present in production', () => {
    it('should set strict-transport-security when isProduction is true', async () => {
      const app = fastify()
      app.register(helmet, buildHelmetOptions({ isProduction: true }))
      app.get('/test', async (_req, res) => {
        res.status(200).send({ ok: true })
      })
      await app.ready()

      const res = await app.inject({ method: 'GET', url: '/test' })
      expect(res.headers['strict-transport-security']).toBeDefined()
      expect(res.headers['strict-transport-security']).toContain(
        'max-age=31536000'
      )
      expect(res.headers['strict-transport-security']).toContain(
        'includeSubDomains'
      )
      await app.close()
    })
  })
})
