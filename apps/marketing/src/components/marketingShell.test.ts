import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  footerGroups,
  isMarketingRouteSlug,
  loginHref,
  primaryNavLinks,
  routePageContent,
  signupHref,
} from './marketingShell'

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

describe('marketing shell auth links', () => {
  it('routes signup and login constants to the app auth pages', () => {
    assert.equal(signupHref, 'https://app.repro.dev/account/register')
    assert.equal(loginHref, 'https://app.repro.dev/account/login')
  })

  it('does not use coming soon for default nav or footer actions', () => {
    for (const link of primaryNavLinks) {
      assert.notEqual(link.href, '/coming-soon')
    }

    for (const group of footerGroups) {
      for (const link of group.links) {
        assert.notEqual(link.href, '/coming-soon')
      }
    }

    assert.equal(
      primaryNavLinks.find(link => link.label === 'Log in')?.href,
      loginHref
    )
    let footerLoginHref: string | undefined

    for (const group of footerGroups) {
      for (const link of group.links) {
        if (link.label === 'Log in') {
          footerLoginHref = link.href
        }
      }
    }

    assert.equal(footerLoginHref, loginHref)
  })
})
