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
