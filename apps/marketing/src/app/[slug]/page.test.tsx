import { createRequire } from 'module'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

const require = createRequire(import.meta.url)

const React = require('react')
globalThis.React = React

describe('marketing route slug page', () => {
  it('only generates static params for retained marketing routes', async t => {
    t.mock.module('~/components/MarketingRoutePage', {
      namedExports: {
        MarketingRoutePage: () => null,
      },
    })

    const { generateStaticParams } = await import('./page')

    assert.deepEqual(generateStaticParams(), [
      { slug: 'privacy' },
      { slug: 'support' },
      { slug: 'terms' },
    ])
  })
})
