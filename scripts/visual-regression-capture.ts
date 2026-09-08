#!/usr/bin/env tsx
/**
 * visual-regression-capture.ts
 *
 * Playwright headless screenshot capture + pixelmatch diff for visual regression.
 *
 * Usage:
 *   tsx scripts/visual-regression-capture.ts \
 *     --storybook-url http://localhost:6099 \
 *     --output-dir /path/to/screenshots \
 *     [--baseline-dir /path/to/baselines] \
 *     [--threshold 0.001] \
 *     --stories '["button--primary","button--secondary"]'
 *
 * If --stories is '[]' or omitted, captures ALL stories from Storybook /index.json.
 * Pass --fail-on-new to exit non-zero when a story has no committed baseline (CI mode).
 *
 * The --threshold input is validated: a finite number in [0, 1]. An invalid
 * value (NaN, out of range) fails non-zero with an actionable error — NaN
 * would otherwise make every diff pass.
 *
 * Outputs JSON to stdout:
 * {
 *   "stories_checked": [...],
 *   "passed": [...],
 *   "failed": [{ "story": "...", "diff_path": "...|null", "changed_pixels": N,
 *                "total_pixels": N, "error": "…" }],
 *   "new_stories": [...]
 * }
 *
 * `error` is present on capture errors and dimension mismatches and explains
 * the failure; `diff_path` is null when no diff PNG exists (capture error).
 * Capture errors are recorded as failures — every checked story lands in a
 * bucket (passed / failed / new_stories), so the exit code stays honest.
 * Corrupt or unreadable baseline/current PNGs are recorded per story the
 * same way, and the run continues to the remaining stories.
 *
 * Every story is captured on a FRESH Playwright page (closed in `finally`),
 * so one story's page failure cannot poison later stories (REP-1648: a dead
 * shared page previously cascaded "Target page, context or browser has been
 * closed" onto every remaining story). When the browser session itself dies
 * mid-run, the loop relaunches it a bounded number of times; once the
 * relaunch budget is exhausted the run fails closed with a clear terminal
 * error instead of silently continuing.
 *
 * Exits 0 if all pass (or all new), non-zero if any fail (or --fail-on-new
 * is set and any story has no baseline). A run that checks zero stories
 * (empty index) always fails closed.
 */

import * as fs from 'fs'
import * as path from 'path'

// Lazily import Playwright chromium — allows unit tests to mock the module
async function getBrowser() {
  const pw = await import('@playwright/test')
  return pw.chromium
}

// Lazily import pixelmatch and pngjs — allows unit tests to mock them
export async function loadPixelmatch() {
  const mod = await import('pixelmatch')
  return mod.default as (
    img1: Buffer | Uint8Array,
    img2: Buffer | Uint8Array,
    output: Buffer | Uint8Array | null,
    width: number,
    height: number,
    options?: { threshold?: number; includeAA?: boolean }
  ) => number
}

export async function loadPng() {
  const mod = await import('pngjs')
  return mod.PNG
}

// ---------------------------------------------------------------------------
// Story capture lifecycle — per-story pages over a reusable browser session
// ---------------------------------------------------------------------------

/**
 * Minimal structural surface of a Playwright Page used by captureStory.
 * Declared as methods so the real Playwright Page type is structurally
 * assignable (bivariant method checks), while tests can inject fakes.
 */
export interface StoryCapturePage {
  goto(
    url: string,
    options?: { waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' }
  ): Promise<unknown>
  addStyleTag(options: { content: string }): Promise<unknown>
  waitForSelector(
    selector: string,
    options?: { timeout?: number }
  ): Promise<unknown>
  waitForTimeout(timeout: number): Promise<unknown>
  screenshot(options: { path: string; fullPage?: boolean }): Promise<unknown>
  close(): Promise<void>
}

/** Browser context — only page creation and cleanup are needed. */
export interface StoryCaptureContext {
  newPage(): Promise<StoryCapturePage>
  close(options?: { reason?: string }): Promise<void>
}

/** Browser — context creation, liveness check, and cleanup. */
export interface StoryCaptureBrowser {
  newContext(options?: {
    viewport?: { width: number; height: number }
  }): Promise<StoryCaptureContext>
  isConnected(): boolean
  close(options?: { reason?: string }): Promise<void>
}

/** Minimal structural surface of Playwright's chromium browser type. */
export interface PlaywrightChromiumLike {
  launch(options?: { headless?: boolean }): Promise<StoryCaptureBrowser>
}

/**
 * One browser + context "session" serving fresh pages, one per story.
 * `isUsable` reports whether the underlying browser can still serve pages —
 * the recovery loop consults it after capture failures to distinguish a
 * story-level problem from a browser-level death.
 */
export interface StoryCaptureSession {
  openPage(): Promise<StoryCapturePage>
  isUsable(): boolean
  close(): Promise<void>
}

export interface StoryCaptureSessionFactory {
  open(): Promise<StoryCaptureSession>
}

/**
 * Relaunch budget after the initial launch. The observed CI failure died
 * once mid-run; 2 relaunches absorb an isolated incident and an unlucky
 * second death while keeping worst-case browser launches bounded
 * (1 initial + 2).
 */
export const DEFAULT_MAX_BROWSER_RELAUNCHES = 2

/**
 * Thrown when the session relaunch budget is exhausted. Terminal: the run
 * records the current story AND every remaining story as failures — a
 * browser that cannot be recovered means the gate verified nothing for
 * those stories, and that must never be reported as green.
 */
export class BrowserRecoveryExhaustedError extends Error {
  readonly relaunches: number
  readonly lastReason: string

  constructor(relaunches: number, lastReason: string) {
    super(
      `browser recovery exhausted after ${relaunches} relaunch attempt(s); last failure: ${lastReason} — remaining stories cannot be captured (failing closed)`
    )
    this.name = 'BrowserRecoveryExhaustedError'
    this.relaunches = relaunches
    this.lastReason = lastReason
  }
}

/**
 * Real Playwright adapter: launches headless chromium and wraps the browser
 * + context in a StoryCaptureSession whose pages are per-story. Context and
 * browser closes are best-effort — a session that died with the browser
 * must still clean up whatever is closable and never block the loop.
 */
export function createPlaywrightSessionFactory(
  chromium: PlaywrightChromiumLike
): StoryCaptureSessionFactory {
  return {
    open: async (): Promise<StoryCaptureSession> => {
      const browser = await chromium.launch({ headless: true })
      try {
        const context = await browser.newContext({
          viewport: { width: 1280, height: 720 },
        })
        return {
          openPage: () => context.newPage(),
          isUsable: () => browser.isConnected(),
          close: async () => {
            await context.close().catch(() => {})
            await browser.close().catch(() => {})
          },
        }
      } catch (err) {
        // Context creation failed — never leak the browser process.
        await browser.close().catch(() => {})
        throw err
      }
    },
  }
}

/**
 * Write a small placeholder PNG at outputPath for dimension-mismatch
 * failures, where a real pixel diff is impossible (the images cannot be
 * compared). A solid magenta body with a black border — obviously synthetic,
 * and referenced by the failure record's error text which carries the exact
 * baseline/current dimensions.
 */
async function writeMismatchPlaceholderPng(outputPath: string): Promise<void> {
  const PNG = await loadPng()
  const width = 320
  const height = 64
  const png = new PNG({ width, height })
  const border = 4
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) * 4
      const isBorder =
        x < border || x >= width - border || y < border || y >= height - border
      png.data[idx] = isBorder ? 0 : 255
      png.data[idx + 1] = 0
      png.data[idx + 2] = isBorder ? 0 : 255
      png.data[idx + 3] = 255
    }
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, PNG.sync.write(png))
}

/**
 * Record a story whose capture threw (navigation failure, networkidle
 * timeout, #storybook-root selector timeout, …) as a failed entry. Every
 * checked story must land in a bucket so the exit code stays honest — a
 * capture error is a failure, never a silent skip.
 */
export function recordCaptureError(
  output: CaptureOutput,
  storyId: string,
  err: unknown
): void {
  output.failed.push({
    story: storyId,
    diff_path: null,
    changed_pixels: 0,
    total_pixels: 0,
    error: err instanceof Error ? err.message : String(err),
  })
}

/**
 * Parse and validate a --threshold input: a finite number in [0, 1].
 * Throws with an actionable message when invalid — NaN or an out-of-range
 * value would silently invert the gate (NaN makes every diff pass, values
 * above 1 do too, negatives make every diff fail).
 */
export function parseThreshold(input: string): number {
  const value = Number(input)

  if (
    input.trim() === '' ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  ) {
    throw new Error(
      `--threshold "${input}" is invalid: it must be a finite number between 0 and 1 (a fraction of pixels, e.g. 0.001 = 0.1%)`
    )
  }

  return value
}

export interface DiffResult {
  changedPixels: number
  totalPixels: number
  diffPath: string | null
  /**
   * Set when the two images had different dimensions. A placeholder diff PNG
   * is written at diffPath (when requested) and the dimensions are reported
   * so the failure record can explain why a pixel diff is meaningless.
   */
  dimensionMismatch?: {
    baselineWidth: number
    baselineHeight: number
    currentWidth: number
    currentHeight: number
  }
}

export interface StoryResult {
  story: string
  /**
   * Path to the written diff PNG, or null when no diff image exists
   * (e.g. the story could not be captured at all).
   */
  diff_path: string | null
  changed_pixels: number
  total_pixels: number
  /**
   * Present on capture errors and dimension mismatches: the reason the
   * story failed. Absent on pure above-threshold pixel diffs.
   */
  error?: string
}

export interface CaptureOutput {
  stories_checked: string[]
  passed: string[]
  failed: StoryResult[]
  new_stories: string[]
}

/**
 * Compute the pixel diff ratio between two PNG buffers.
 * Returns { changedPixels, totalPixels, diffPath } where diffPath is
 * the written diff PNG path (or null if outputPath not provided).
 */
export async function diffPngBuffers(
  baselineBuffer: Buffer,
  currentBuffer: Buffer,
  outputPath: string | null
): Promise<DiffResult> {
  const PNG = await loadPng()
  const pixelmatch = await loadPixelmatch()

  const baseline = PNG.sync.read(baselineBuffer)
  const current = PNG.sync.read(currentBuffer)

  // Images must be the same dimensions to diff; if different treat all as
  // changed and write a placeholder diff so the failure record never points
  // at a diff PNG that was never written.
  if (baseline.width !== current.width || baseline.height !== current.height) {
    const totalPixels = current.width * current.height
    let diffPath: string | null = null
    if (outputPath !== null) {
      await writeMismatchPlaceholderPng(outputPath)
      diffPath = outputPath
    }
    return {
      changedPixels: totalPixels,
      totalPixels,
      diffPath,
      dimensionMismatch: {
        baselineWidth: baseline.width,
        baselineHeight: baseline.height,
        currentWidth: current.width,
        currentHeight: current.height,
      },
    }
  }

  const { width, height } = baseline
  const totalPixels = width * height
  const diffPng = new PNG({ width, height })

  const changedPixels = pixelmatch(
    baseline.data,
    current.data,
    diffPng.data,
    width,
    height,
    { threshold: 0.1, includeAA: false }
  )

  let diffPath: string | null = null
  if (outputPath !== null) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
    fs.writeFileSync(outputPath, PNG.sync.write(diffPng))
    diffPath = outputPath
  }

  return { changedPixels, totalPixels, diffPath }
}

/**
 * Determine if a diff ratio exceeds the threshold.
 * threshold is a fraction of total pixels (e.g., 0.001 = 0.1%).
 */
export function isAboveThreshold(
  changedPixels: number,
  totalPixels: number,
  threshold: number
): boolean {
  if (totalPixels === 0) return false
  return changedPixels / totalPixels > threshold
}

/** File paths involved in diffing one captured story against its baseline. */
export interface StoryDiffPaths {
  baselinePath: string
  screenshotPath: string
  diffOutputPath: string
}

function readPngFile(filePath: string): Buffer {
  try {
    return fs.readFileSync(filePath)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`could not read PNG at ${filePath}: ${message}`)
  }
}

/**
 * Diff one captured story against its baseline and record the outcome in
 * `output` (passed / failed with counts, or a capture error). Unreadable or
 * corrupt PNGs — truncated baseline, missing screenshot file, invalid PNG
 * data — are recorded per story through recordCaptureError so the run
 * continues to the remaining stories and the exit code stays honest,
 * instead of crashing with an unstructured error.
 */
export async function diffStoryAgainstBaseline(
  output: CaptureOutput,
  storyId: string,
  paths: StoryDiffPaths,
  threshold: number
): Promise<void> {
  try {
    const baselineBuffer = readPngFile(paths.baselinePath)
    const currentBuffer = readPngFile(paths.screenshotPath)

    const { changedPixels, totalPixels, diffPath, dimensionMismatch } =
      await diffPngBuffers(baselineBuffer, currentBuffer, paths.diffOutputPath)

    if (dimensionMismatch) {
      // Baseline and current dimensions differ: a pixel diff is impossible,
      // so fail with the mismatch recorded and the placeholder diff path.
      output.failed.push({
        story: storyId,
        diff_path: diffPath,
        changed_pixels: changedPixels,
        total_pixels: totalPixels,
        error: `Image dimensions differ: baseline ${dimensionMismatch.baselineWidth}x${dimensionMismatch.baselineHeight}, current ${dimensionMismatch.currentWidth}x${dimensionMismatch.currentHeight} — pixel diff skipped, diff PNG is a placeholder`,
      })
    } else if (isAboveThreshold(changedPixels, totalPixels, threshold)) {
      output.failed.push({
        story: storyId,
        diff_path: diffPath,
        changed_pixels: changedPixels,
        total_pixels: totalPixels,
      })
    } else {
      output.passed.push(storyId)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`Error diffing story ${storyId}: ${message}`)
    recordCaptureError(
      output,
      storyId,
      new Error(
        `could not diff against the committed baseline (${message}) — the baseline or captured PNG may be corrupt or unreadable; see docs/visual-regression.md to regenerate`
      )
    )
  }
}

/**
 * Determine the process exit code from the capture output.
 *
 * Above-threshold failures always exit 1. New stories (no committed baseline)
 * only exit 1 when failOnNew is set — CI passes --fail-on-new so a new story
 * cannot land without its baseline; local runs default to off so the manual
 * first-capture UX is unchanged.
 *
 * A run that checked zero stories fails closed: an empty index (or an empty
 * --stories list against one) means the gate verified nothing, which must
 * never be reported as green.
 */
export function computeExitCode(
  output: CaptureOutput,
  failOnNew: boolean
): number {
  if (output.stories_checked.length === 0) return 1
  if (output.failed.length > 0) return 1
  if (failOnNew && output.new_stories.length > 0) return 1
  return 0
}

function parseArgs(argv: string[]): {
  storybookUrl: string
  outputDir: string
  baselineDir: string | null
  threshold: number
  storyIds: string[]
  failOnNew: boolean
  help: boolean
} {
  const args = argv.slice(2)
  let storybookUrl = 'http://localhost:6099'
  let outputDir = ''
  let baselineDir: string | null = null
  let threshold = 0.001
  let storyIds: string[] = []
  let failOnNew = false
  let help = false

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--help' || arg === '-h') {
      help = true
    } else if (arg === '--storybook-url' && args[i + 1]) {
      storybookUrl = args[++i]!
    } else if (arg === '--output-dir' && args[i + 1]) {
      outputDir = args[++i]!
    } else if (arg === '--baseline-dir' && args[i + 1]) {
      baselineDir = args[++i]!
    } else if (arg === '--threshold' && args[i + 1]) {
      try {
        threshold = parseThreshold(args[++i]!)
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`)
        process.exit(1)
      }
    } else if (arg === '--fail-on-new') {
      failOnNew = true
    } else if (arg === '--stories' && args[i + 1]) {
      try {
        storyIds = JSON.parse(args[++i]!)
      } catch {
        console.error('Error: --stories must be a valid JSON array')
        process.exit(1)
      }
    }
  }

  return {
    storybookUrl,
    outputDir,
    baselineDir,
    threshold,
    storyIds,
    failOnNew,
    help,
  }
}

async function fetchStoryIds(storybookUrl: string): Promise<string[]> {
  const response = await fetch(`${storybookUrl}/index.json`)
  if (!response.ok) {
    throw new Error(
      `Failed to fetch Storybook index: ${response.status} ${response.statusText}`
    )
  }
  const index = (await response.json()) as {
    entries: Record<string, { type: string }>
  }
  return Object.entries(index.entries)
    .filter(([, entry]) => entry.type === 'story')
    .map(([id]) => id)
}

export async function captureStory(
  page: StoryCapturePage,
  storybookUrl: string,
  storyId: string,
  outputPath: string
): Promise<void> {
  await page.goto(`${storybookUrl}/iframe.html?id=${storyId}&viewMode=story`, {
    waitUntil: 'networkidle',
  })

  // Disable animations for deterministic screenshots
  await page.addStyleTag({
    content: '* { animation: none !important; transition: none !important; }',
  })

  // Wait for story root to be non-empty
  await page.waitForSelector('#storybook-root:not(:empty)', { timeout: 10000 })

  // Additional settle delay for any remaining layout work
  await page.waitForTimeout(500)

  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  await page.screenshot({ path: outputPath, fullPage: true })
}

export interface CaptureStoriesOptions {
  storyIds: readonly string[]
  storybookUrl: string
  outputDir: string
  /** null captures into new_stories (the --update-baselines flow). */
  baselineDir: string | null
  threshold: number
  /** Session factory seam — the real one launches Playwright chromium. */
  openSession: () => Promise<StoryCaptureSession>
  /**
   * Relaunch budget after the initial launch (default
   * DEFAULT_MAX_BROWSER_RELAUNCHES). Every post-initial session open —
   * proactive relaunch, page-open failure recovery, and the one per-story
   * retry after a session death — funnels through the same budget.
   */
  maxRelaunches?: number
  log?: (message: string) => void
}

/**
 * Capture every story on its own fresh page, reusing one browser session
 * while it stays healthy.
 *
 * Failure model (REP-1648):
 * - a story-level capture failure is recorded via recordCaptureError and the
 *   run continues with the next story on a fresh page;
 * - a session death (page open fails, or `isUsable()` goes false) triggers a
 *   bounded relaunch; the story that coincided with the death is retried
 *   once on the recovered session before being recorded as failed;
 * - once the relaunch budget is exhausted, `BrowserRecoveryExhaustedError`
 *   records the current story AND every remaining story as failures — the
 *   run fails closed instead of silently continuing;
 * - the session is closed in `finally` on every path, so no chromium
 *   process outlives the run.
 */
export async function captureStories(
  options: CaptureStoriesOptions
): Promise<CaptureOutput> {
  const {
    storyIds,
    storybookUrl,
    outputDir,
    baselineDir,
    threshold,
    openSession,
  } = options
  const maxRelaunches = options.maxRelaunches ?? DEFAULT_MAX_BROWSER_RELAUNCHES
  const log = options.log ?? ((message: string) => console.error(message))

  const output: CaptureOutput = {
    stories_checked: [...storyIds],
    passed: [],
    failed: [],
    new_stories: [],
  }

  let session: StoryCaptureSession | null = null
  let sessionsOpened = 0
  let relaunches = 0
  let lastSessionFailure = 'browser session is no longer usable'

  const closeSession = async (): Promise<void> => {
    const doomed = session
    session = null
    if (doomed === null) return
    await doomed.close().catch(() => {})
  }

  /**
   * Read the current session through a declared return type. A direct read
   * in the loop body would inherit TypeScript's stale `null` narrowing —
   * `session` is only ever reassigned inside these closures, so the outer
   * body's narrowing collapses `!== null` checks to `never`.
   */
  const currentSession = (): StoryCaptureSession | null => session

  /**
   * Open a session, enforcing the relaunch budget on every open after the
   * first. All recovery paths funnel through here, so the number of browser
   * launches over a run is bounded: 1 initial + maxRelaunches.
   */
  const openTrackedSession = async (): Promise<StoryCaptureSession> => {
    if (sessionsOpened > 0) {
      if (relaunches >= maxRelaunches) {
        throw new BrowserRecoveryExhaustedError(
          maxRelaunches,
          lastSessionFailure
        )
      }
      relaunches += 1
      log(
        `[visual-regression-capture] browser session lost (${lastSessionFailure}); relaunching (${relaunches}/${maxRelaunches})...`
      )
    }
    sessionsOpened += 1
    return await openSession()
  }

  const acquireStoryPage = async (): Promise<StoryCapturePage> => {
    // Bounded progress loop: every iteration either opens a tracked session
    // (budget-enforced), closes a dead session, or returns a page — so the
    // recovery budget, not this loop, bounds the retries.
    while (true) {
      if (session === null) {
        session = await openTrackedSession()
      }
      const current = session
      if (!current.isUsable()) {
        lastSessionFailure =
          'browser session is no longer usable (disconnected)'
        await closeSession()
        continue
      }
      try {
        return await current.openPage()
      } catch (err) {
        // Opening a page on this session failed — the browser/context is
        // gone. Drop the session; the next iteration relaunches (budgeted).
        lastSessionFailure = `could not open a story page: ${
          err instanceof Error ? err.message : String(err)
        }`
        await closeSession()
      }
    }
  }

  try {
    for (let i = 0; i < storyIds.length; i++) {
      const storyId = storyIds[i]!
      const screenshotPath = path.join(outputDir, `${storyId}.png`)
      let captured = false
      let retriedAfterSessionLoss = false

      while (true) {
        let page: StoryCapturePage | null = null
        let captureError: unknown = null
        try {
          page = await acquireStoryPage()
          await captureStory(page, storybookUrl, storyId, screenshotPath)
        } catch (err) {
          captureError = err
        } finally {
          // The page is per-story: closed on success, failure, and retry.
          if (page !== null) {
            await page.close().catch(() => {})
          }
        }

        if (captureError === null) {
          captured = true
          break
        }

        if (captureError instanceof BrowserRecoveryExhaustedError) {
          // Terminal: the browser cannot be recovered. This story and every
          // remaining one are recorded as failures so the exit code stays
          // honest — a partially-captured run must never report green.
          log(
            `[visual-regression-capture] ${captureError.message} — recording ${
              storyIds.length - i
            } story(s) as failed`
          )
          recordCaptureError(output, storyId, captureError)
          for (const remaining of storyIds.slice(i + 1)) {
            recordCaptureError(output, remaining, captureError)
          }
          return output
        }

        // Snapshot the session that served this story before narrowing: the
        // variable is reassigned only inside the closures above, so a direct
        // read here carries TypeScript's stale null-narrowing.
        const sessionAfterFailure = currentSession()
        const sessionUsable =
          sessionAfterFailure !== null && sessionAfterFailure.isUsable()
        if (!sessionUsable && !retriedAfterSessionLoss) {
          // The browser died during this story — retry the story once on a
          // recovered session before recording a failure.
          retriedAfterSessionLoss = true
          lastSessionFailure = `browser session lost during capture of ${storyId}`
          log(
            `[visual-regression-capture] browser died during capture of ${storyId}; retrying once on a fresh session...`
          )
          await closeSession()
          continue
        }

        console.error(`Error capturing story ${storyId}:`, captureError)
        recordCaptureError(output, storyId, captureError)
        if (!sessionUsable) {
          await closeSession()
        }
        break
      }

      if (!captured) continue

      if (baselineDir === null) {
        // No baseline dir — treat as new story
        output.new_stories.push(storyId)
        continue
      }

      const baselinePath = path.join(baselineDir, `${storyId}.png`)

      if (!fs.existsSync(baselinePath)) {
        // No baseline exists for this story — it's new
        output.new_stories.push(storyId)
        continue
      }

      await diffStoryAgainstBaseline(
        output,
        storyId,
        {
          baselinePath,
          screenshotPath,
          diffOutputPath: path.join(outputDir, `${storyId}.diff.png`),
        },
        threshold
      )
    }
  } finally {
    await closeSession()
  }

  return output
}

async function main(): Promise<void> {
  const {
    storybookUrl,
    outputDir,
    baselineDir,
    threshold,
    storyIds: requestedStories,
    failOnNew,
    help,
  } = parseArgs(process.argv)

  if (help) {
    console.log(`Usage: tsx scripts/visual-regression-capture.ts [options]

Options:
  --storybook-url <url>     Storybook URL (default: http://localhost:6099)
  --output-dir <path>       Directory to write screenshots
  --baseline-dir <path>     Directory containing baseline screenshots (enables diff)
  --threshold <float>       Pixel diff threshold as fraction in [0, 1]
                            (default: 0.001 = 0.1%)
  --fail-on-new             Exit non-zero when a story has no committed baseline
                            (used in CI so a new story must ship its baseline)
  --stories <json>          JSON array of story IDs; empty array captures all stories
  --help                    Show this help message
`)
    process.exit(0)
  }

  if (!outputDir) {
    console.error('Error: --output-dir is required')
    process.exit(1)
  }

  fs.mkdirSync(outputDir, { recursive: true })

  // Resolve story IDs: use provided list or fetch all from Storybook
  let storyIds = requestedStories
  if (storyIds.length === 0) {
    storyIds = await fetchStoryIds(storybookUrl)
  }

  // Fail closed on an empty check set: `--stories '[]'` against an index
  // with zero `type: 'story'` entries must not exit 0 — a gate that checked
  // nothing is not green.
  if (storyIds.length === 0) {
    const output: CaptureOutput = {
      stories_checked: [],
      passed: [],
      failed: [],
      new_stories: [],
    }
    console.error(
      'Error: no stories to check — the Storybook index has no story entries (failing closed)'
    )
    console.log(JSON.stringify(output, null, 2))
    process.exit(computeExitCode(output, failOnNew))
  }

  const chromium = await getBrowser()
  const { open } = createPlaywrightSessionFactory(chromium)

  const output = await captureStories({
    storyIds,
    storybookUrl,
    outputDir,
    baselineDir,
    threshold,
    openSession: open,
  })

  console.log(JSON.stringify(output, null, 2))

  process.exit(computeExitCode(output, failOnNew))
}

// Only run main() when invoked directly (not when imported by tests)
if (
  process.argv[1] &&
  (process.argv[1].endsWith('visual-regression-capture.ts') ||
    process.argv[1].endsWith('visual-regression-capture.js'))
) {
  main().catch(err => {
    console.error(err)
    process.exit(1)
  })
}
