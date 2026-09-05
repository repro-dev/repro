/**
 * Docs-pages gate (REP-1648) — deterministic subset of the REP-1643
 * fragmentation class, executed against a running Storybook:
 *
 * - every docs entry renders a non-empty preview
 * - no raw JSDoc tags leak as visible page text (manager + docs preview)
 * - no test-named stories in the index (story exports named "Test ...")
 *
 * Requires STORYBOOK_URL (set by scripts/storybook-gates.sh). Fails fast
 * when unset so a wiring mistake cannot silently skip the gate.
 */

import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import {
  extractDocsEntries,
  findRawJSDocLeaks,
  isTestNamedStory,
} from '../../scripts/docs-page-checks'

const STORYBOOK_URL = process.env.STORYBOOK_URL

if (!STORYBOOK_URL) {
  throw new Error(
    'docs-pages gate requires STORYBOOK_URL (set by scripts/storybook-gates.sh)'
  )
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

test('storybook index contains no test-named stories', async ({ request }) => {
  const response = await request.get(`${STORYBOOK_URL}/index.json`)
  expect(response.ok()).toBe(true)

  const index = (await response.json()) as {
    entries: Record<string, { type?: string; name?: string; title?: string }>
  }

  const testNamed = Object.entries(index.entries)
    .filter(
      ([, entry]) =>
        entry.type === 'story' && entry.name && isTestNamedStory(entry.name)
    )
    .map(([id, entry]) => `${id} (${entry.name})`)

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

  const response = await request.get(`${STORYBOOK_URL}/index.json`)
  expect(response.ok()).toBe(true)

  const index = (await response.json()) as {
    entries: Record<string, { type?: string; name?: string; title?: string }>
  }
  const docsEntries = extractDocsEntries(index)
  expect(
    docsEntries.length,
    'expected the index to contain docs entries (autodocs is enabled)'
  ).toBeGreaterThan(0)

  const failures: string[] = []

  for (const docsId of docsEntries) {
    await page.goto(`${STORYBOOK_URL}/?path=/docs/${docsId}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    })
    await page.waitForSelector('#storybook-preview-iframe', { timeout: 20_000 })

    const previewText = await readPreviewText(page)
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
