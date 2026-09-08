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
      threshold = parseFloat(args[++i]!)
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

async function captureStory(
  page: import('@playwright/test').Page,
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
  --threshold <float>       Pixel diff threshold as fraction (default: 0.001 = 0.1%)
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
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  })
  const page = await context.newPage()

  const output: CaptureOutput = {
    stories_checked: storyIds,
    passed: [],
    failed: [],
    new_stories: [],
  }

  for (const storyId of storyIds) {
    const screenshotPath = path.join(outputDir, `${storyId}.png`)

    try {
      await captureStory(page, storybookUrl, storyId, screenshotPath)
    } catch (err) {
      console.error(`Error capturing story ${storyId}:`, err)
      recordCaptureError(output, storyId, err)
      continue
    }

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

    const baselineBuffer = fs.readFileSync(baselinePath)
    const currentBuffer = fs.readFileSync(screenshotPath)
    const diffOutputPath = path.join(outputDir, `${storyId}.diff.png`)

    const { changedPixels, totalPixels, diffPath, dimensionMismatch } =
      await diffPngBuffers(baselineBuffer, currentBuffer, diffOutputPath)

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
  }

  await browser.close()

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
