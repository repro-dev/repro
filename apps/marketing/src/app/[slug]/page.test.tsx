import { afterEach, describe, it } from 'node:test'

import { cleanup } from '@testing-library/react'
import assert from 'node:assert/strict'

afterEach(cleanup)

describe('MarketingRoutePage static params', () => {
  it('omits the explicit high-intent routes from the dynamic slug list', async t => {
    t.mock.module('../../components/MarketingRoutePage.module.css', {
      defaultExport: {},
    })
    t.mock.module('../../components/MarketingShell.module.css', {
      defaultExport: {},
    })

    const { generateStaticParams } = await import('./page')

    const params = generateStaticParams()
    const slugs = params.map(({ slug }) => slug)

    assert.equal(slugs.includes('features'), false)
    assert.equal(slugs.includes('install-extension'), false)
    assert.equal(slugs.includes('pricing'), false)
  })
})
