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
 *
 * Outputs JSON to stdout:
 * {
 *   "stories_checked": [...],
 *   "passed": [...],
 *   "failed": [{ "story": "...", "diff_path": "...", "changed_pixels": N, "total_pixels": N }],
 *   "new_stories": [...]
 * }
 *
 * Exits 0 if all pass (or all new), non-zero if any fail.
 */

import * as fs from "fs";
import * as path from "path";

// Lazily import Playwright chromium — allows unit tests to mock the module
async function getBrowser() {
  const pw = await import("@playwright/test");
  return pw.chromium;
}

// Lazily import pixelmatch and pngjs — allows unit tests to mock them
export async function loadPixelmatch() {
  const mod = await import("pixelmatch");
  return mod.default as (
    img1: Buffer | Uint8Array,
    img2: Buffer | Uint8Array,
    output: Buffer | Uint8Array | null,
    width: number,
    height: number,
    options?: { threshold?: number; includeAA?: boolean },
  ) => number;
}

export async function loadPng() {
  const mod = await import("pngjs");
  return mod.PNG;
}

export interface DiffResult {
  changedPixels: number;
  totalPixels: number;
  diffPath: string | null;
}

export interface StoryResult {
  story: string;
  diff_path: string;
  changed_pixels: number;
  total_pixels: number;
}

export interface CaptureOutput {
  stories_checked: string[];
  passed: string[];
  failed: StoryResult[];
  new_stories: string[];
}

/**
 * Compute the pixel diff ratio between two PNG buffers.
 * Returns { changedPixels, totalPixels, diffPath } where diffPath is
 * the written diff PNG path (or null if outputPath not provided).
 */
export async function diffPngBuffers(
  baselineBuffer: Buffer,
  currentBuffer: Buffer,
  outputPath: string | null,
): Promise<DiffResult> {
  const PNG = await loadPng();
  const pixelmatch = await loadPixelmatch();

  const baseline = PNG.sync.read(baselineBuffer);
  const current = PNG.sync.read(currentBuffer);

  // Images must be the same dimensions to diff; if different treat all as changed
  if (baseline.width !== current.width || baseline.height !== current.height) {
    const totalPixels = current.width * current.height;
    return { changedPixels: totalPixels, totalPixels, diffPath: null };
  }

  const { width, height } = baseline;
  const totalPixels = width * height;
  const diffPng = new PNG({ width, height });

  const changedPixels = pixelmatch(
    baseline.data,
    current.data,
    diffPng.data,
    width,
    height,
    { threshold: 0.1, includeAA: false },
  );

  let diffPath: string | null = null;
  if (outputPath !== null) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, PNG.sync.write(diffPng));
    diffPath = outputPath;
  }

  return { changedPixels, totalPixels, diffPath };
}

/**
 * Determine if a diff ratio exceeds the threshold.
 * threshold is a fraction of total pixels (e.g., 0.001 = 0.1%).
 */
export function isAboveThreshold(
  changedPixels: number,
  totalPixels: number,
  threshold: number,
): boolean {
  if (totalPixels === 0) return false;
  return changedPixels / totalPixels > threshold;
}

function parseArgs(argv: string[]): {
  storybookUrl: string;
  outputDir: string;
  baselineDir: string | null;
  threshold: number;
  storyIds: string[];
  help: boolean;
} {
  const args = argv.slice(2);
  let storybookUrl = "http://localhost:6099";
  let outputDir = "";
  let baselineDir: string | null = null;
  let threshold = 0.001;
  let storyIds: string[] = [];
  let help = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      help = true;
    } else if (arg === "--storybook-url" && args[i + 1]) {
      storybookUrl = args[++i]!;
    } else if (arg === "--output-dir" && args[i + 1]) {
      outputDir = args[++i]!;
    } else if (arg === "--baseline-dir" && args[i + 1]) {
      baselineDir = args[++i]!;
    } else if (arg === "--threshold" && args[i + 1]) {
      threshold = parseFloat(args[++i]!);
    } else if (arg === "--stories" && args[i + 1]) {
      try {
        storyIds = JSON.parse(args[++i]!);
      } catch {
        console.error("Error: --stories must be a valid JSON array");
        process.exit(1);
      }
    }
  }

  return { storybookUrl, outputDir, baselineDir, threshold, storyIds, help };
}

async function fetchStoryIds(storybookUrl: string): Promise<string[]> {
  const response = await fetch(`${storybookUrl}/index.json`);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch Storybook index: ${response.status} ${response.statusText}`,
    );
  }
  const index = (await response.json()) as {
    entries: Record<string, { type: string }>;
  };
  return Object.entries(index.entries)
    .filter(([, entry]) => entry.type === "story")
    .map(([id]) => id);
}

async function captureStory(
  page: import("@playwright/test").Page,
  storybookUrl: string,
  storyId: string,
  outputPath: string,
): Promise<void> {
  await page.goto(`${storybookUrl}/iframe.html?id=${storyId}&viewMode=story`, {
    waitUntil: "networkidle",
  });

  // Disable animations for deterministic screenshots
  await page.addStyleTag({
    content: "* { animation: none !important; transition: none !important; }",
  });

  // Wait for story root to be non-empty
  await page.waitForSelector("#storybook-root:not(:empty)", { timeout: 10000 });

  // Additional settle delay for any remaining layout work
  await page.waitForTimeout(500);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  await page.screenshot({ path: outputPath, fullPage: true });
}

async function main(): Promise<void> {
  const {
    storybookUrl,
    outputDir,
    baselineDir,
    threshold,
    storyIds: requestedStories,
    help,
  } = parseArgs(process.argv);

  if (help) {
    console.log(`Usage: tsx scripts/visual-regression-capture.ts [options]

Options:
  --storybook-url <url>     Storybook URL (default: http://localhost:6099)
  --output-dir <path>       Directory to write screenshots
  --baseline-dir <path>     Directory containing baseline screenshots (enables diff)
  --threshold <float>       Pixel diff threshold as fraction (default: 0.001 = 0.1%)
  --stories <json>          JSON array of story IDs; empty array captures all stories
  --help                    Show this help message
`);
    process.exit(0);
  }

  if (!outputDir) {
    console.error("Error: --output-dir is required");
    process.exit(1);
  }

  fs.mkdirSync(outputDir, { recursive: true });

  // Resolve story IDs: use provided list or fetch all from Storybook
  let storyIds = requestedStories;
  if (storyIds.length === 0) {
    storyIds = await fetchStoryIds(storybookUrl);
  }

  const chromium = await getBrowser();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();

  const output: CaptureOutput = {
    stories_checked: storyIds,
    passed: [],
    failed: [],
    new_stories: [],
  };

  for (const storyId of storyIds) {
    const screenshotPath = path.join(outputDir, `${storyId}.png`);

    try {
      await captureStory(page, storybookUrl, storyId, screenshotPath);
    } catch (err) {
      console.error(`Error capturing story ${storyId}:`, err);
      continue;
    }

    if (baselineDir === null) {
      // No baseline dir — treat as new story
      output.new_stories.push(storyId);
      continue;
    }

    const baselinePath = path.join(baselineDir, `${storyId}.png`);

    if (!fs.existsSync(baselinePath)) {
      // No baseline exists for this story — it's new
      output.new_stories.push(storyId);
      continue;
    }

    const baselineBuffer = fs.readFileSync(baselinePath);
    const currentBuffer = fs.readFileSync(screenshotPath);
    const diffOutputPath = path.join(outputDir, `${storyId}.diff.png`);

    const { changedPixels, totalPixels, diffPath } = await diffPngBuffers(
      baselineBuffer,
      currentBuffer,
      diffOutputPath,
    );

    if (isAboveThreshold(changedPixels, totalPixels, threshold)) {
      output.failed.push({
        story: storyId,
        diff_path: diffPath ?? diffOutputPath,
        changed_pixels: changedPixels,
        total_pixels: totalPixels,
      });
    } else {
      output.passed.push(storyId);
    }
  }

  await browser.close();

  console.log(JSON.stringify(output, null, 2));

  const hasFailures = output.failed.length > 0;
  process.exit(hasFailures ? 1 : 0);
}

// Only run main() when invoked directly (not when imported by tests)
if (
  process.argv[1] &&
  (process.argv[1].endsWith("visual-regression-capture.ts") ||
    process.argv[1].endsWith("visual-regression-capture.js"))
) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
