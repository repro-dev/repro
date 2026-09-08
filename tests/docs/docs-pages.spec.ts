/**
 * Docs-pages gate (REP-1648) — deterministic subset of the REP-1643
 * fragmentation class, executed against a running Storybook:
 *
 * - the index contains stories and docs entries (a zero-story index must
 *   fail, not trivially pass)
 * - every docs entry renders a non-empty preview
 * - no raw JSDoc tags leak as visible page text (manager + docs preview)
 * - no test-named stories in the index (story exports named "Test ...")
 *
 * Requires STORYBOOK_URL (set by scripts/storybook-gates.sh). Fails fast
 * when unset so a wiring mistake cannot silently skip the gate.
 */

import type { APIRequestContext, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import {
  extractDocsEntries,
  extractStoryEntries,
  findRawJSDocLeaks,
  isTestNamedStory,
} from '../../scripts/docs-page-checks'

const STORYBOOK_URL = process.env.STORYBOOK_URL

if (!STORYBOOK_URL) {
  throw new Error(
    'docs-pages gate requires STORYBOOK_URL (set by scripts/storybook-gates.sh)'
  )
}

interface StorybookIndex {
  entries: Record<string, { type?: string; name?: string; title?: string }>
}

/** Extra attempts for a cold Storybook boot (see readDocsEntry). */
const COLD_RETRIES = 2
const COLD_RETRY_WAIT_MS = 2_000
/** Retries for index.json — the manager URL going 200 does not guarantee the index is served yet. */
const INDEX_RETRIES = 3
const INDEX_RETRY_WAIT_MS = 1_000

/**
 * Fetch the Storybook index, retrying a bounded number of times when the
 * payload is empty: a freshly booted server can 200 with no entries before
 * it finishes indexing, which must not read as a broken index.
 */
async function fetchStorybookIndex(
  request: APIRequestContext
): Promise<StorybookIndex> {
  let index: StorybookIndex = { entries: {} }

  for (let attempt = 1; attempt <= INDEX_RETRIES; attempt++) {
    const response = await request.get(`${STORYBOOK_URL}/index.json`)
    expect(response.ok()).toBe(true)
    index = (await response.json()) as StorybookIndex

    if (Object.keys(index.entries ?? {}).length > 0) {
      return index
    }

    await new Promise(resolve => setTimeout(resolve, INDEX_RETRY_WAIT_MS))
  }

  return index
}

/** Docs previews render after the manager bootstraps; wait for any content. */
async function readPreviewText(page: Page): Promise<string> {
  const previewFrame = page
    .frames()
    .find(
      frame => frame !== page.mainFrame() && /iframe\.html/.test(frame.url())
    )

  if (!previewFrame) {
    return ''
  }

  // Poll until the docs content renders (the preview iframe hydrates async).
  for (let waited = 0; waited < 10_000; waited += 250) {
    const text = (
      await previewFrame
        .locator('body')
        .innerText()
        .catch(() => '')
    ).trim()
    if (text.length > 0) {
      return text
    }
    await page.waitForTimeout(250)
  }

  return ''
}

/**
 * Load a docs entry and read its preview text, retrying on empty. The
 * manager can render an empty docs preview while it cold-boots (first
 * navigations after server boot); a bounded reload keeps that transient
 * state from failing the gate while a genuinely fragmented page still
 * fails deterministically after all retries.
 */
async function readDocsEntry(page: Page, docsId: string): Promise<string> {
  for (let attempt = 1; attempt <= 1 + COLD_RETRIES; attempt++) {
    await page.goto(`${STORYBOOK_URL}/?path=/docs/${docsId}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    })
    await page.waitForSelector('#storybook-preview-iframe', { timeout: 20_000 })

    const previewText = await readPreviewText(page)
    if (previewText.length >= 20) {
      return previewText
    }

    if (attempt <= COLD_RETRIES) {
      await page.waitForTimeout(COLD_RETRY_WAIT_MS)
    }
  }

  return ''
}

test('storybook index contains no test-named stories', async ({ request }) => {
  const index = await fetchStorybookIndex(request)
  const storyEntries = extractStoryEntries(index)

  expect(
    storyEntries.length,
    'expected the index to contain at least one story entry — a zero-story index (broken Storybook boot) must fail this check rather than trivially pass'
  ).toBeGreaterThan(0)

  const testNamed = storyEntries
    .filter(([id, entry]) => isTestNamedStory(id, entry.name))
    .map(([id, entry]) => `${id} (${entry.name ?? 'no name'})`)

  expect(
    testNamed,
    'stories must not be named "Test ..." — rename the story export so the docs index stays clean (REP-1643 class)'
  ).toEqual([])
})

test('every docs page renders non-fragmented content without raw JSDoc leaks', async ({
  page,
  request,
}) => {
  // 70+ docs entries × ~2s manager load each — a long-running sweep.
  test.setTimeout(600_000)

  const index = await fetchStorybookIndex(request)
  const docsEntries = extractDocsEntries(index)
  expect(
    docsEntries.length,
    'expected the index to contain docs entries (autodocs is enabled)'
  ).toBeGreaterThan(0)

  const failures: string[] = []

  for (const docsId of docsEntries) {
    const previewText = await readDocsEntry(page, docsId)
    const managerText = (
      await page
        .locator('body')
        .innerText()
        .catch(() => '')
    ).trim()

    if (previewText.length < 20) {
      failures.push(
        `${docsId}: docs preview renders empty or near-empty content`
      )
      continue
    }

    const leaks = Array.from(
      new Set([
        ...findRawJSDocLeaks(previewText),
        ...findRawJSDocLeaks(managerText),
      ])
    )

    if (leaks.length > 0) {
      failures.push(
        `${docsId}: raw JSDoc tags leak as page text: ${leaks.join(', ')}`
      )
    }
  }

  expect(
    failures,
    `docs fragmentation failures (${failures.length} of ${
      docsEntries.length
    } entries):\n${failures.join('\n')}`
  ).toEqual([])
})
