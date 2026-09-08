/**
 * docs-page-checks.ts
 *
 * Deterministic helpers for the docs-pages Playwright gate (REP-1648) that
 * catch the REP-1643 fragmentation class:
 *
 * - docs entries from a Storybook index.json
 * - raw JSDoc tags leaked as rendered page text (`@example`, `@param`,
 *   `@returns`, `@see`, `@link`, `{@link`)
 * - test-named stories (`Test ...` exports) that pollute the docs index
 *
 * Pure functions — no DOM, no network — so the harness logic stays
 * unit-testable and the Playwright spec stays thin.
 */

export interface StorybookIndexEntry {
  type?: string
  name?: string
  title?: string
}

export interface StorybookIndex {
  entries: Record<string, StorybookIndexEntry>
}

/**
 * Return the docs-type entry ids from a Storybook index.json payload,
 * in index order.
 */
export function extractDocsEntries(index: StorybookIndex): string[] {
  return Object.entries(index.entries)
    .filter(([, entry]) => entry.type === 'docs')
    .map(([id]) => id)
}

/**
 * Return the story-type entry pairs from a Storybook index.json payload,
 * in index order. The docs gate asserts this list is non-empty before
 * scanning it: a zero-story index (broken Storybook boot, empty build)
 * must fail the check instead of trivially passing.
 */
export function extractStoryEntries(
  index: StorybookIndex
): Array<[string, StorybookIndexEntry]> {
  return Object.entries(index.entries).filter(
    ([, entry]) => entry.type === 'story'
  )
}

/**
 * Raw-JSDoc leak pattern: a JSDoc tag appearing as visible page text.
 * Tags must start a line or follow whitespace (a JSDoc asterisk counts) so
 * email addresses (`contact@example.com`) and mid-word matches
 * (`@exampleTag`) are not false positives.
 */
const RAW_JSDOC_TAG_PATTERN =
  /(?:^|[\s*])(@(?:example|param|returns|see|link)\b)|(\{@link\b)/g

/**
 * Return the unique raw JSDoc tags visible in rendered docs text.
 * Empty array = clean page.
 */
export function findRawJSDocLeaks(text: string): string[] {
  const leaks = new Set<string>()

  for (const match of text.matchAll(RAW_JSDOC_TAG_PATTERN)) {
    // Group 1: a whitespace/line-started @tag; group 2: a {@link sequence.
    leaks.add(match[1] ?? match[2]!)
  }

  return Array.from(leaks)
}

/**
 * True when a story looks test-named — the REP-1643 "test-named story"
 * docs pollution class (e.g. an exported story named `TestDisabled`
 * renders as "Test Disabled" in the docs index).
 *
 * Checks two signals:
 * - the raw story id's final `--` segment (CSF3 kebab-cases the export
 *   key into the id, so `TestDisabled` → `...--test-disabled`), which
 *   covers index entries that carry no humanized name
 * - the humanized story name when provided (overridden names, spaced forms)
 */
export function isTestNamedStory(storyId: string, storyName?: string): boolean {
  const idSegment = storyId.split('--').pop()?.trim() ?? ''
  if (/^test\b/i.test(idSegment)) {
    return true
  }

  if (storyName && /^test\b/i.test(storyName.trim())) {
    return true
  }

  return false
}

// ---------------------------------------------------------------------------
// Storybook index fetching with bounded cold-boot retries (review fix 6)
// ---------------------------------------------------------------------------

/** Structural subset of Playwright's APIResponse. */
export interface StorybookIndexResponse {
  ok(): boolean
  status(): number
  statusText(): string
  json(): Promise<unknown>
}

/** Structural subset of Playwright's APIRequestContext (get only). */
export interface StorybookIndexFetcher {
  get(url: string): Promise<StorybookIndexResponse>
}

export interface FetchStorybookIndexOptions {
  /** Total attempts (first call + retries). Default 3. */
  retries?: number
  /** Sleep between attempts, in ms. Default 1000. */
  retryWaitMs?: number
}

const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms))

/**
 * Fetch the Storybook index with a bounded retry loop (REP-1648 review fix
 * 6). A freshly booted server can serve an empty index, a transient non-2xx
 * (502/503), or a reset socket before it finishes indexing — all of those
 * are retried within the bound instead of failing the gate on attempt 1.
 *
 * On an exhausted bound:
 * - a 200 response that stayed empty is RETURNED — the zero-story
 *   assertions own that failure with their tailored "broken Storybook
 *   boot" message;
 * - anything else (persistent non-2xx, transport errors) THROWS with the
 *   last observed status/error, since a zero-story message would mislead.
 */
export async function fetchStorybookIndex(
  request: StorybookIndexFetcher,
  storybookUrl: string,
  options: FetchStorybookIndexOptions = {}
): Promise<StorybookIndex> {
  const retries = options.retries ?? 3
  const retryWaitMs = options.retryWaitMs ?? 1_000
  const url = `${storybookUrl}/index.json`

  let index: StorybookIndex = { entries: {} }
  let lastOutcome: 'ok-empty' | 'http-error' | 'transport-error' =
    'transport-error'
  let lastDetail = 'no response'

  for (let attempt = 1; attempt <= retries; attempt++) {
    let response: StorybookIndexResponse

    try {
      response = await request.get(url)
    } catch (err) {
      lastOutcome = 'transport-error'
      lastDetail = err instanceof Error ? err.message : String(err)
      if (attempt < retries) await sleep(retryWaitMs)
      continue
    }

    if (response.ok()) {
      try {
        index = (await response.json()) as StorybookIndex
      } catch (err) {
        // Malformed payload — retried like any other cold-boot state.
        lastOutcome = 'transport-error'
        lastDetail = err instanceof Error ? err.message : String(err)
        if (attempt < retries) await sleep(retryWaitMs)
        continue
      }

      if (Object.keys(index.entries ?? {}).length > 0) {
        return index
      }

      lastOutcome = 'ok-empty'
      lastDetail = 'empty index payload'
    } else {
      lastOutcome = 'http-error'
      lastDetail = `HTTP ${response.status()} ${response.statusText()}`.trim()
    }

    if (attempt < retries) await sleep(retryWaitMs)
  }

  if (lastOutcome === 'ok-empty') {
    return index
  }

  throw new Error(
    `${url} never returned a usable Storybook index across ${retries} attempts (last: ${lastDetail}) — retrying the gate may help if Storybook was still booting`
  )
}
