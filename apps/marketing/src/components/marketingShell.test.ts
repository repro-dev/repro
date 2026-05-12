import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { isMarketingRouteSlug, routePageContent } from './marketingShell'

describe('marketing shell route map', () => {
  it('keeps high-intent routes out of the slug model', () => {
    for (const slug of [
      'features',
      'install-extension',
      'pricing',
      'blog',
      'changelog',
      'about',
      'contact',
      'refund-policy',
    ]) {
      assert.equal(slug in routePageContent, false)
      assert.equal(isMarketingRouteSlug(slug), false)
    }

    for (const slug of ['privacy', 'support', 'terms']) {
      assert.equal(slug in routePageContent, true)
      assert.equal(isMarketingRouteSlug(slug), true)
    }
  })
})
