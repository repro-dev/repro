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
  extractStoryEntries,
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

describe('extractStoryEntries', () => {
  it('returns story-type entry pairs in index order', () => {
    const index = {
      entries: {
        'button--default': { type: 'story', name: 'Default' },
        'button--docs': { type: 'docs', name: 'Docs' },
        'atoms-group': { type: 'component', name: 'Atoms' },
        'playback--test-disabled': { type: 'story', name: 'Default' },
      },
    }

    assert.deepEqual(extractStoryEntries(index), [
      ['button--default', { type: 'story', name: 'Default' }],
      ['playback--test-disabled', { type: 'story', name: 'Default' }],
    ])
  })

  it('returns an empty array for a zero-story index (the gate must fail the check instead)', () => {
    assert.deepEqual(
      extractStoryEntries({ entries: { 'button--docs': { type: 'docs' } } }),
      []
    )
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

  it('flags story ids whose final segment begins with the word test', () => {
    // CSF3 kebab-cases the export key into the id segment: `TestDisabled`
    // export → id `...--test-disabled`. Storybook's id sanitizer maps
    // separators (spaces, underscores) to '-', so '-' and end-of-string
    // are the only real boundaries.
    assert.equal(isTestNamedStory('components-checkbox--test-disabled'), true)
    assert.equal(isTestNamedStory('checkbox--test'), true)
    assert.equal(isTestNamedStory('test'), true)
  })

  it('does not flag story ids whose final segment merely contains test', () => {
    assert.equal(isTestNamedStory('button--default'), false)
    assert.equal(isTestNamedStory('input--latest-test'), false)
    assert.equal(isTestNamedStory('select--testing-states'), false)
    assert.equal(isTestNamedStory('toggle--contested'), false)
  })

  it('checks the id segment even when the index entry has no name', () => {
    // Entries without a name must not bypass the check — the id segment is
    // the fallback signal.
    assert.equal(
      isTestNamedStory('components-checkbox--test-disabled', undefined),
      true
    )
    assert.equal(
      isTestNamedStory('components-checkbox--default', undefined),
      false
    )
  })

  it('checks the humanized name in addition to the id segment', () => {
    // Overridden name: id clean, name test-named → flagged.
    assert.equal(isTestNamedStory('checkbox--default', 'Test Disabled'), true)
    // Name clean, id test-named → flagged.
    assert.equal(isTestNamedStory('checkbox--test-disabled', 'Default'), true)
    // Both clean → not flagged.
    assert.equal(isTestNamedStory('checkbox--default', 'Default'), false)
  })
})
