/**
 * Unit tests for docs-page-checks.ts — the deterministic docs-fragmentation
 * helpers behind the docs-pages Playwright gate (REP-1648, REP-1643 class).
 *
 * Run:
 *   node --test scripts/docs-page-checks.test.ts
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  extractDocsEntries,
  findRawJSDocLeaks,
  isTestNamedStory,
} from './docs-page-checks.ts'

describe('extractDocsEntries', () => {
  it('returns ids of docs-type entries only', () => {
    const index = {
      entries: {
        'button--default': { type: 'story', name: 'Default' },
        'button--docs': { type: 'docs', name: 'Docs' },
        'intro--page': { type: 'docs', name: 'Page' },
        'atoms-group': { type: 'component', name: 'Atoms' },
      },
    }

    assert.deepEqual(extractDocsEntries(index), ['button--docs', 'intro--page'])
  })

  it('returns an empty array when there are no docs entries', () => {
    assert.deepEqual(
      extractDocsEntries({ entries: { 'button--default': { type: 'story' } } }),
      []
    )
  })
})

describe('findRawJSDocLeaks', () => {
  it('flags raw JSDoc tags rendered as page text', () => {
    const pageText = [
      'Primary button used for the main action.',
      '@example',
      '```tsx',
      '<Button variant="primary">Click</Button>',
      '```',
      '@param variant — the visual style',
      '@returns JSX element',
    ].join('\n')

    const leaks = findRawJSDocLeaks(pageText)

    assert.ok(leaks.includes('@example'))
    assert.ok(leaks.includes('@param'))
    assert.ok(leaks.includes('@returns'))
  })

  it('flags @see, @link tags and JSDoc link syntax', () => {
    const leaks = findRawJSDocLeaks(
      'See the docs @see Button and {@link Badge} for more @link details'
    )

    assert.ok(leaks.includes('@see'))
    assert.ok(leaks.includes('{@link'))
    assert.ok(leaks.includes('@link'))
  })

  it('does not flag rendered docs text that merely references components', () => {
    const pageText = [
      'The Button component supports the primary and outlined variants.',
      'Props: variant, size, disabled.',
      'Examples of usage are shown below.',
      'This paragraph mentions parameters in prose form.',
    ].join('\n')

    assert.deepEqual(findRawJSDocLeaks(pageText), [])
  })

  it('does not match email-like or tag-like content that is not a JSDoc tag', () => {
    assert.deepEqual(findRawJSDocLeaks('contact@example.com for help'), [])
    assert.deepEqual(findRawJSDocLeaks('the @exampleTag rule'), [])
  })

  it('returns an empty array for empty text', () => {
    assert.deepEqual(findRawJSDocLeaks(''), [])
    assert.deepEqual(findRawJSDocLeaks('   \n  '), [])
  })
})

describe('isTestNamedStory', () => {
  it('flags story names that begin with the word test', () => {
    assert.equal(isTestNamedStory('Test Disabled'), true)
    assert.equal(isTestNamedStory('test disabled'), true)
    assert.equal(isTestNamedStory('Test'), true)
    assert.equal(isTestNamedStory('TEST edge case'), true)
  })

  it('does not flag names that merely contain test', () => {
    assert.equal(isTestNamedStory('Latest Value'), false)
    assert.equal(isTestNamedStory('Testing States'), false)
    assert.equal(isTestNamedStory('Contested Toggle'), false)
    assert.equal(isTestNamedStory('Default'), false)
  })
})
