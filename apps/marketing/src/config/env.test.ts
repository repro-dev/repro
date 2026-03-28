import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createEnv } from './env'

describe('createEnv', () => {
  it('parses valid env values', () => {
    const env = createEnv({
      BUILD_ENV: 'development',
      REPRO_APP_URL: 'https://app.repro.localhost:1355',
      REPRO_MARKETING_URL: 'https://marketing.repro.localhost:1355',
    })

    assert.equal(env.BUILD_ENV, 'development')
    assert.equal(env.REPRO_APP_URL, 'https://app.repro.localhost:1355')
    assert.equal(
      env.REPRO_MARKETING_URL,
      'https://marketing.repro.localhost:1355'
    )
  })

  it('applies default BUILD_ENV when absent', () => {
    const env = createEnv({
      REPRO_APP_URL: 'https://app.repro.localhost:1355',
      REPRO_MARKETING_URL: 'https://marketing.repro.localhost:1355',
    })

    assert.equal(env.BUILD_ENV, 'production')
  })

  it('applies default REPRO_APP_URL when absent', () => {
    const env = createEnv({})

    assert.equal(env.REPRO_APP_URL, 'https://app.repro.dev')
  })

  it('applies default REPRO_MARKETING_URL when absent', () => {
    const env = createEnv({})

    assert.equal(env.REPRO_MARKETING_URL, 'https://repro.dev')
  })

  it('throws on invalid BUILD_ENV value', () => {
    assert.throws(() =>
      createEnv({
        BUILD_ENV: 'staging',
        REPRO_APP_URL: 'https://app.repro.localhost:1355',
        REPRO_MARKETING_URL: 'https://marketing.repro.localhost:1355',
      })
    )
  })

  it('throws on non-URL REPRO_APP_URL', () => {
    assert.throws(() =>
      createEnv({
        BUILD_ENV: 'development',
        REPRO_APP_URL: 'not-a-url',
        REPRO_MARKETING_URL: 'https://marketing.repro.localhost:1355',
      })
    )
  })
})
