import assert from 'node:assert'
import { describe, it } from 'node:test'
import { replaceURLsInCSSText, resolveURLToResource } from './index'

// The renderer's resourceMap format is { absoluteURL: resourceId } — the
// inverse of createResourceMap's { resourceId: absoluteURL } format.
// Callers like NativeDOMRenderer.tsx invert the map before passing it in.

describe('vdom-renderer: resolveURLToResource', () => {
  it('should resolve a URL to its resource ID path when present in map', () => {
    // resourceMap is { absoluteURL: resourceId } (inverted from createResourceMap)
    const resourceMap: Record<string, string> = {
      'http://example.com/icons.svg': 'abc1',
    }

    const result = resolveURLToResource(
      'http://example.com/icons.svg',
      'http://example.com/',
      '/resources/',
      resourceMap
    )

    assert.strictEqual(result, '/resources/abc1')
  })

  it('should return the absolute URL when not in the resource map', () => {
    const result = resolveURLToResource(
      'http://example.com/missing.png',
      'http://example.com/',
      '/resources/',
      {}
    )

    assert.strictEqual(result, 'http://example.com/missing.png')
  })

  it('should pass through hash-only URLs unchanged', () => {
    const result = resolveURLToResource(
      '#inline-symbol',
      'http://example.com/',
      '/resources/',
      {}
    )

    assert.strictEqual(result, '#inline-symbol')
  })
})

describe('vdom-renderer: replaceURLsInCSSText', () => {
  it('should replace url() references in CSS text with resource URLs', () => {
    // resourceMap is { absoluteURL: resourceId }
    const resourceMap: Record<string, string> = {
      'http://example.com/bg.png': 'img1',
    }

    const cssText = 'background-image: url("http://example.com/bg.png")'
    const result = replaceURLsInCSSText(
      cssText,
      'http://example.com/',
      '/resources/',
      resourceMap
    )

    assert.ok(
      result.includes('/resources/img1'),
      `Expected resource URL in: ${result}`
    )
  })

  it('should leave data URIs unchanged', () => {
    const dataURI = 'data:image/png;base64,abc123'
    const cssText = `background-image: url("${dataURI}")`
    const result = replaceURLsInCSSText(
      cssText,
      'http://example.com/',
      '/resources/',
      {}
    )

    assert.ok(
      result.includes(dataURI),
      `Expected data URI to be unchanged in: ${result}`
    )
  })

  it('should leave hash-only url() references unchanged', () => {
    // CSS filters can use hash references like url(#filter-id)
    const cssText = 'filter: url(#goo)'
    const result = replaceURLsInCSSText(
      cssText,
      'http://example.com/',
      '/resources/',
      {}
    )

    // Should not blow up, and should keep the hash reference
    assert.ok(
      result.includes('#goo'),
      `Expected hash ref unchanged in: ${result}`
    )
  })
})

describe('vdom-renderer: Gap 2 - <use> href resolution (renderer side)', () => {
  it('resolveURLToResource resolves base URL of external SVG sprite file', () => {
    // The resource map contains the base SVG URL (hash was stripped before
    // adding to the map). resourceMap is { absoluteURL: resourceId }.
    const resourceMap: Record<string, string> = {
      'http://example.com/icons.svg': 'svg1',
    }

    const result = resolveURLToResource(
      'http://example.com/icons.svg',
      'http://example.com/',
      '/resources/',
      resourceMap
    )

    assert.strictEqual(result, '/resources/svg1')
  })
})
