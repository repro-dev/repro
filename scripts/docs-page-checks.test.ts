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
  fetchStorybookIndex,
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

// ---------------------------------------------------------------------------
// fetchStorybookIndex (review fix 6): transient non-2xx responses (and
// transport/malformed-payload errors) must be retried within the bounded
// retry loop — not just empty 200 payloads. A cold Storybook boot can 502
// or reset the socket before it finishes indexing.
// ---------------------------------------------------------------------------

interface FakeResponseScript {
  status?: number
  statusText?: string
  payload?: unknown
  throw?: Error
}

/**
 * Queue-based request fake: responses are consumed in order; the last
 * entry repeats when the caller retries beyond the script.
 */
function makeFakeRequest(scripts: FakeResponseScript[]) {
  let calls = 0

  return {
    callCount: () => calls,
    get: async (_url: string) => {
      const next = scripts[Math.min(calls, scripts.length - 1)]!
      calls += 1

      if (next.throw) {
        throw next.throw
      }

      const status = next.status ?? 200
      return {
        ok: () => status >= 200 && status < 300,
        status: () => status,
        statusText: () => next.statusText ?? '',
        json: async () => next.payload,
      }
    },
  }
}

const POPULATED_INDEX = {
  entries: {
    'button--default': { type: 'story', name: 'Default' },
    'button--docs': { type: 'docs', name: 'Docs' },
  },
}

const EMPTY_INDEX = { entries: {} }

describe('fetchStorybookIndex', () => {
  it('returns a populated index immediately without retrying', async () => {
    const request = makeFakeRequest([{ payload: POPULATED_INDEX }])

    const index = await fetchStorybookIndex(request, 'http://localhost:6099', {
      retryWaitMs: 0,
    })

    assert.deepEqual(index, POPULATED_INDEX)
    assert.equal(request.callCount(), 1)
  })

  it('retries empty 200 payloads until the index is populated', async () => {
    const request = makeFakeRequest([
      { payload: EMPTY_INDEX },
      { payload: POPULATED_INDEX },
    ])

    const index = await fetchStorybookIndex(request, 'http://localhost:6099', {
      retryWaitMs: 0,
    })

    assert.deepEqual(index, POPULATED_INDEX)
    assert.equal(request.callCount(), 2)
  })

  it('returns the empty index after exhausting retries on persistent empty 200s', async () => {
    // A persistent empty 200 is a broken boot: the helper hands back the
    // empty index so the zero-story assertions own the failure with their
    // tailored message (broken Storybook boot, empty build).
    const request = makeFakeRequest([{ payload: EMPTY_INDEX }])

    const index = await fetchStorybookIndex(request, 'http://localhost:6099', {
      retryWaitMs: 0,
    })

    assert.deepEqual(index, EMPTY_INDEX)
    assert.equal(request.callCount(), 3, 'must be bounded by INDEX_RETRIES')
  })

  it('retries transient non-2xx responses', async () => {
    const request = makeFakeRequest([
      { status: 503, statusText: 'Service Unavailable' },
      { payload: POPULATED_INDEX },
    ])

    const index = await fetchStorybookIndex(request, 'http://localhost:6099', {
      retryWaitMs: 0,
    })

    assert.deepEqual(index, POPULATED_INDEX)
    assert.equal(request.callCount(), 2)
  })

  it('throws with the last status after exhausting retries on persistent non-2xx', async () => {
    const request = makeFakeRequest([
      { status: 502, statusText: 'Bad Gateway' },
    ])

    await assert.rejects(
      fetchStorybookIndex(request, 'http://localhost:6099', { retryWaitMs: 0 }),
      (error: Error) => {
        assert.match(error.message, /502 Bad Gateway/)
        assert.match(error.message, /never returned a usable Storybook index/)
        assert.match(error.message, /retrying the gate may help/)
        return true
      }
    )
    assert.equal(request.callCount(), 3, 'must be bounded by INDEX_RETRIES')
  })

  it('retries transient transport errors', async () => {
    const request = makeFakeRequest([
      { throw: new Error('socket hang up') },
      { payload: POPULATED_INDEX },
    ])

    const index = await fetchStorybookIndex(request, 'http://localhost:6099', {
      retryWaitMs: 0,
    })

    assert.deepEqual(index, POPULATED_INDEX)
    assert.equal(request.callCount(), 2)
  })

  it('retries a malformed JSON payload', async () => {
    const request = makeFakeRequest([
      { payload: 'not json at all' },
      { payload: POPULATED_INDEX },
    ])

    const index = await fetchStorybookIndex(request, 'http://localhost:6099', {
      retryWaitMs: 0,
    })

    assert.deepEqual(index, POPULATED_INDEX)
    assert.equal(request.callCount(), 2)
  })

  it('honors a smaller retry bound', async () => {
    const request = makeFakeRequest([
      { status: 503, statusText: 'Service Unavailable' },
    ])

    await assert.rejects(
      fetchStorybookIndex(request, 'http://localhost:6099', {
        retries: 2,
        retryWaitMs: 0,
      })
    )
    assert.equal(request.callCount(), 2)
  })
})
