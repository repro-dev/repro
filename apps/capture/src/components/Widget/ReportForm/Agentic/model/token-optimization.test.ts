import assert from 'node:assert'
import { describe, it } from 'node:test'
import {
  estimateTokens,
  shortenStackFrame,
  shortenUrl,
  truncate,
} from './token-optimization'

describe('estimateTokens', () => {
  it('returns ceil of JSON length divided by 4 for empty object', () => {
    const input = {}
    const expected = Math.ceil(JSON.stringify(input).length / 4)
    assert.strictEqual(estimateTokens(input), expected)
  })

  it('returns ceil of JSON length divided by 4 for small object', () => {
    const input = { foo: 'bar', count: 42 }
    const expected = Math.ceil(JSON.stringify(input).length / 4)
    assert.strictEqual(estimateTokens(input), expected)
  })

  it('returns ceil of JSON length divided by 4 for string', () => {
    const input = 'hello world'
    const expected = Math.ceil(JSON.stringify(input).length / 4)
    assert.strictEqual(estimateTokens(input), expected)
  })
})

describe('shortenStackFrame', () => {
  it('converts full CDN URL with line and column to basename:line:col', () => {
    assert.strictEqual(
      shortenStackFrame(
        'https://cdn.example.com/static/js/main.abc123.js:42:10'
      ),
      'main.abc123.js:42:10'
    )
  })

  it('converts full URL with tsx extension and line to basename:line', () => {
    assert.strictEqual(
      shortenStackFrame('https://example.com/ProductList.tsx:42'),
      'ProductList.tsx:42'
    )
  })

  it('returns bare filename with line and column unchanged', () => {
    assert.strictEqual(shortenStackFrame('app.js:10:5'), 'app.js:10:5')
  })

  it('returns bare filename with line only unchanged', () => {
    assert.strictEqual(shortenStackFrame('app.js:10'), 'app.js:10')
  })

  it('returns non-matching strings unchanged', () => {
    assert.strictEqual(shortenStackFrame('some random text'), 'some random text')
  })
})

describe('shortenUrl', () => {
  it('extracts pathname and search from full URL', () => {
    assert.strictEqual(
      shortenUrl('https://example.com/api/users?page=1'),
      '/api/users?page=1'
    )
  })

  it('returns original string for non-parseable URLs', () => {
    assert.strictEqual(shortenUrl('not-a-url'), 'not-a-url')
  })

  it('returns full URL when mode is full', () => {
    const url = 'https://example.com/api/users?page=1'
    assert.strictEqual(shortenUrl(url, 'full'), url)
  })
})

describe('truncate', () => {
  it('returns string unchanged when under limit', () => {
    assert.strictEqual(truncate('hello', 10), 'hello')
  })

  it('truncates and adds ellipsis when over limit', () => {
    const result = truncate('hello world', 8)
    assert.strictEqual(result.length, 8)
    assert.ok(result.endsWith('…'))
  })

  it('returns string unchanged when at exact limit', () => {
    assert.strictEqual(truncate('hello', 5), 'hello')
  })
})
