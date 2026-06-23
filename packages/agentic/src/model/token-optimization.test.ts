import assert from 'node:assert'
import { describe, it } from 'node:test'
import {
  estimateTokens,
  shortenStackFrame,
  shortenUrl,
  truncate,
} from './token-optimization'

describe('estimateTokens', () => {
  it('returns heuristic count for empty object', () => {
    // JSON.stringify({}) = "{}" = 2 chars → Math.ceil(2/4) = 1
    assert.strictEqual(estimateTokens({}), 1)
  })

  it('returns heuristic count for small object', () => {
    // JSON.stringify({ foo: 'bar', count: 42 }) =
    //   '{"foo":"bar","count":42}' = 23 chars → Math.ceil(23/4) = 6
    assert.strictEqual(estimateTokens({ foo: 'bar', count: 42 }), 6)
  })

  it('returns heuristic count for string', () => {
    // JSON.stringify('hello world') = '"hello world"' = 14 chars → Math.ceil(14/4) = 4
    assert.strictEqual(estimateTokens('hello world'), 4)
  })

  it('returns a reasonable estimate for a known input', () => {
    // JSON.stringify('The quick brown fox jumps over the lazy dog.') =
    //   '"The quick brown fox jumps over the lazy dog."' = 47 chars → Math.ceil(47/4) = 12
    const result = estimateTokens(
      'The quick brown fox jumps over the lazy dog.'
    )
    const expected = Math.ceil(
      JSON.stringify('The quick brown fox jumps over the lazy dog.').length / 4
    )
    assert.strictEqual(result, expected) // 12
  })

  it('uses Math.ceil (not Math.round) to avoid undercounting', () => {
    // JSON.stringify('hey') = '"hey"' = 5 chars → Math.ceil(5/4) = 2, Math.round(5/4) = 1
    // The two diverge here — ceil prevents undercounting, which would risk context overflow.
    const input = 'hey'
    const result = estimateTokens(input)
    const serialized = JSON.stringify(input)
    assert.strictEqual(result, Math.ceil(serialized.length / 4))
    assert.strictEqual(result, 2)
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
    assert.strictEqual(
      shortenStackFrame('some random text'),
      'some random text'
    )
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
