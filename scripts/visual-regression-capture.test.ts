/**
 * Unit tests for visual-regression-capture.ts
 *
 * Tests the threshold logic, diffPngBuffers, isAboveThreshold, and JSON output shape.
 * Does NOT require a running browser or Storybook — Playwright is mocked.
 *
 * Run:
 *   node --experimental-test-module-mocks --test scripts/visual-regression-capture.test.ts
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { PNG } from 'pngjs'

// ---------------------------------------------------------------------------
// Helpers to build PNG buffers for tests
// ---------------------------------------------------------------------------

function makeSolidPng(
  width: number,
  height: number,
  r: number,
  g: number,
  b: number
): Buffer {
  const png = new PNG({ width, height })
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) * 4
      png.data[idx] = r
      png.data[idx + 1] = g
      png.data[idx + 2] = b
      png.data[idx + 3] = 255
    }
  }
  return PNG.sync.write(png)
}

// ---------------------------------------------------------------------------
// Import the module under test
// We import after helpers so mocks can be set up if needed
// ---------------------------------------------------------------------------

import {
  computeExitCode,
  diffPngBuffers,
  isAboveThreshold,
  recordCaptureError,
  type CaptureOutput,
} from './visual-regression-capture.ts'

// ---------------------------------------------------------------------------
// isAboveThreshold — pure logic, no I/O
// ---------------------------------------------------------------------------

describe('isAboveThreshold', () => {
  it('returns false when diff ratio is below threshold', () => {
    // 0.0005 ratio vs 0.001 threshold → pass
    assert.equal(isAboveThreshold(5, 10000, 0.001), false)
  })

  it('returns true when diff ratio exceeds threshold', () => {
    // 0.002 ratio vs 0.001 threshold → fail
    assert.equal(isAboveThreshold(20, 10000, 0.001), true)
  })

  it('returns false when exactly at threshold (not strictly greater)', () => {
    // Exactly 0.001: 10/10000 = 0.001 → NOT above (uses >), so pass
    assert.equal(isAboveThreshold(10, 10000, 0.001), false)
  })

  it('returns false when totalPixels is 0 (avoid divide-by-zero)', () => {
    assert.equal(isAboveThreshold(0, 0, 0.001), false)
  })

  it('returns false when changedPixels is 0', () => {
    assert.equal(isAboveThreshold(0, 10000, 0.001), false)
  })

  it('handles threshold 0 with any non-zero change as failing', () => {
    assert.equal(isAboveThreshold(1, 10000, 0), true)
  })
})

// ---------------------------------------------------------------------------
// diffPngBuffers — uses pixelmatch + pngjs, writes to a temp file
// ---------------------------------------------------------------------------

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

describe('diffPngBuffers', () => {
  it('returns 0 changed pixels for two identical images', async () => {
    const buf = makeSolidPng(10, 10, 100, 150, 200)
    const result = await diffPngBuffers(buf, buf, null)

    assert.equal(result.changedPixels, 0)
    assert.equal(result.totalPixels, 100)
    assert.equal(result.diffPath, null)
  })

  it('returns non-zero changed pixels for different images', async () => {
    const red = makeSolidPng(10, 10, 255, 0, 0)
    const blue = makeSolidPng(10, 10, 0, 0, 255)
    const result = await diffPngBuffers(red, blue, null)

    assert.ok(result.changedPixels > 0, 'Expected non-zero changed pixels')
    assert.equal(result.totalPixels, 100)
  })

  it('writes diff image to outputPath when provided', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vr-test-'))
    const diffPath = path.join(tmpDir, 'test.diff.png')

    const red = makeSolidPng(10, 10, 255, 0, 0)
    const blue = makeSolidPng(10, 10, 0, 0, 255)
    const result = await diffPngBuffers(red, blue, diffPath)

    assert.equal(result.diffPath, diffPath)
    assert.ok(fs.existsSync(diffPath), 'Diff file should exist')

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('treats size-mismatched images as fully changed', async () => {
    const small = makeSolidPng(5, 5, 100, 100, 100)
    const large = makeSolidPng(10, 10, 100, 100, 100)
    const result = await diffPngBuffers(small, large, null)

    assert.equal(result.changedPixels, result.totalPixels)
    assert.equal(result.totalPixels, 100) // uses current (large) dimensions
  })

  it('does not write diff file when outputPath is null', async () => {
    const buf = makeSolidPng(10, 10, 50, 50, 50)
    const result = await diffPngBuffers(buf, buf, null)
    assert.equal(result.diffPath, null)
  })
})

// ---------------------------------------------------------------------------
// --fail-on-new exit-code behavior (REP-1648)
// ---------------------------------------------------------------------------

describe('--fail-on-new exit code', () => {
  it('exits 1 when new stories exist and --fail-on-new is set (fail closed)', () => {
    const output: CaptureOutput = {
      stories_checked: ['button--new'],
      passed: [],
      failed: [],
      new_stories: ['button--new'],
    }

    assert.equal(computeExitCode(output, true), 1)
  })

  it('exits 0 when new stories exist but --fail-on-new is off (local UX unchanged)', () => {
    const output: CaptureOutput = {
      stories_checked: ['button--new'],
      passed: [],
      failed: [],
      new_stories: ['button--new'],
    }

    assert.equal(computeExitCode(output, false), 0)
  })

  it('exits 1 on above-threshold failures regardless of --fail-on-new', () => {
    const output: CaptureOutput = {
      stories_checked: ['button--primary'],
      passed: [],
      failed: [
        {
          story: 'button--primary',
          diff_path: '/tmp/button--primary.diff.png',
          changed_pixels: 150,
          total_pixels: 10000,
        },
      ],
      new_stories: [],
    }

    assert.equal(computeExitCode(output, false), 1)
    assert.equal(computeExitCode(output, true), 1)
  })

  it('exits 0 when all stories pass with a baseline, --fail-on-new on or off', () => {
    const output: CaptureOutput = {
      stories_checked: ['button--primary'],
      passed: ['button--primary'],
      failed: [],
      new_stories: [],
    }

    assert.equal(computeExitCode(output, false), 0)
    assert.equal(computeExitCode(output, true), 0)
  })

  it('mixes failures and new stories: still exits 1', () => {
    const output: CaptureOutput = {
      stories_checked: ['button--primary', 'button--secondary'],
      passed: [],
      failed: [
        {
          story: 'button--primary',
          diff_path: '/tmp/button--primary.diff.png',
          changed_pixels: 150,
          total_pixels: 10000,
        },
      ],
      new_stories: ['button--secondary'],
    }

    assert.equal(computeExitCode(output, true), 1)
  })
})

// ---------------------------------------------------------------------------
// Capture-error accounting (REP-1648 review blocker 1)
// ---------------------------------------------------------------------------

describe('capture-error accounting', () => {
  it('records a capture error as a failed entry carrying the error message', () => {
    const output: CaptureOutput = {
      stories_checked: ['button--primary'],
      passed: [],
      failed: [],
      new_stories: [],
    }

    recordCaptureError(
      output,
      'button--primary',
      new Error('Timeout 10000ms exceeded waiting for #storybook-root')
    )

    assert.equal(output.failed.length, 1)
    const failed = output.failed[0]!
    assert.equal(failed.story, 'button--primary')
    assert.match(failed.error!, /Timeout 10000ms exceeded/)
    // No screenshot was produced, so no diff path can exist.
    assert.equal(failed.diff_path, null)
    assert.equal(failed.changed_pixels, 0)
    assert.equal(failed.total_pixels, 0)
  })

  it('stringifies non-Error throwables', () => {
    const output: CaptureOutput = {
      stories_checked: ['button--primary'],
      passed: [],
      failed: [],
      new_stories: [],
    }

    recordCaptureError(output, 'button--primary', 'navigation failed')

    assert.equal(output.failed[0]!.error, 'navigation failed')
  })

  it('exits 1 when a story failed to capture, even with --fail-on-new off', () => {
    const output: CaptureOutput = {
      stories_checked: ['button--primary'],
      passed: [],
      failed: [],
      new_stories: [],
    }
    recordCaptureError(
      output,
      'button--primary',
      new Error('net::ERR_CONNECTION_REFUSED')
    )

    // A capture error must never fall through to a green exit (the story
    // cannot be in passed or new_stories — it was checked and failed).
    assert.equal(computeExitCode(output, false), 1)
    assert.equal(computeExitCode(output, true), 1)
  })

  it('every checked story lands in a bucket: passed + failed + new covers all', () => {
    const output: CaptureOutput = {
      stories_checked: ['a--one', 'a--two', 'a--three'],
      passed: ['a--one'],
      failed: [],
      new_stories: ['a--three'],
    }
    recordCaptureError(output, 'a--two', new Error('boom'))

    const accounted = new Set([
      ...output.passed,
      ...output.failed.map(f => f.story),
      ...output.new_stories,
    ])
    for (const story of output.stories_checked) {
      assert.ok(
        accounted.has(story),
        `story ${story} must land in a bucket (exit-code honesty)`
      )
    }
  })
})

// ---------------------------------------------------------------------------
// Zero-story fail closed (REP-1648 review blocker 1)
// ---------------------------------------------------------------------------

describe('zero-story fail closed', () => {
  it('exits 1 when no stories were checked (empty index), regardless of --fail-on-new', () => {
    const output: CaptureOutput = {
      stories_checked: [],
      passed: [],
      failed: [],
      new_stories: [],
    }

    assert.equal(computeExitCode(output, false), 1)
    assert.equal(computeExitCode(output, true), 1)
  })
})

// ---------------------------------------------------------------------------
// Dimension-mismatch placeholder diff (REP-1648 review minor 12)
// ---------------------------------------------------------------------------

describe('dimension-mismatch placeholder diff', () => {
  it('writes a real placeholder diff PNG and reports both dimensions', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vr-mismatch-'))
    const diffPath = path.join(tmpDir, 'story.diff.png')

    const small = makeSolidPng(5, 5, 100, 100, 100)
    const large = makeSolidPng(10, 10, 100, 100, 100)
    const result = await diffPngBuffers(small, large, diffPath)

    // The failure record must never point at a file that was not written.
    assert.equal(result.diffPath, diffPath)
    assert.ok(fs.existsSync(diffPath), 'placeholder diff must exist on disk')
    const parsed = PNG.sync.read(fs.readFileSync(diffPath))
    assert.ok(
      parsed.width > 0 && parsed.height > 0,
      'placeholder must be a valid PNG'
    )

    assert.deepEqual(result.dimensionMismatch, {
      baselineWidth: 5,
      baselineHeight: 5,
      currentWidth: 10,
      currentHeight: 10,
    })

    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('still reports fully-changed counts with no diff path when outputPath is null', async () => {
    const small = makeSolidPng(5, 5, 100, 100, 100)
    const large = makeSolidPng(10, 10, 100, 100, 100)
    const result = await diffPngBuffers(small, large, null)

    assert.equal(result.changedPixels, result.totalPixels)
    assert.equal(result.diffPath, null)
    assert.ok(result.dimensionMismatch)
  })
})

// ---------------------------------------------------------------------------
// CaptureOutput JSON shape
// ---------------------------------------------------------------------------

describe('CaptureOutput shape', () => {
  it('has the expected fields in JSON output', () => {
    const output: CaptureOutput = {
      stories_checked: ['button--primary', 'button--secondary'],
      passed: ['button--primary'],
      failed: [
        {
          story: 'button--secondary',
          diff_path: '/tmp/button--secondary.diff.png',
          changed_pixels: 150,
          total_pixels: 10000,
        },
      ],
      new_stories: ['button--new'],
    }

    const json = JSON.parse(JSON.stringify(output))

    assert.ok(Array.isArray(json.stories_checked))
    assert.ok(Array.isArray(json.passed))
    assert.ok(Array.isArray(json.failed))
    assert.ok(Array.isArray(json.new_stories))

    const failed = json.failed[0]
    assert.equal(typeof failed.story, 'string')
    assert.ok(
      typeof failed.diff_path === 'string' || failed.diff_path === null,
      'diff_path is a path string, or null when no diff image exists'
    )
    assert.equal(typeof failed.changed_pixels, 'number')
    assert.equal(typeof failed.total_pixels, 'number')
    // error is optional: present on capture/mismatch failures, absent on
    // pure above-threshold failures.
    assert.ok(
      typeof failed.error === 'string' || typeof failed.error === 'undefined'
    )
  })

  it('serializes capture errors with the error field in JSON output', () => {
    const output: CaptureOutput = {
      stories_checked: ['button--primary'],
      passed: [],
      failed: [],
      new_stories: [],
    }
    recordCaptureError(output, 'button--primary', new Error('capture blew up'))

    const json = JSON.parse(JSON.stringify(output)) as CaptureOutput
    assert.equal(json.failed[0]!.error, 'capture blew up')
    assert.equal(json.failed[0]!.diff_path, null)
  })

  it('new story is recorded in new_stories, not in failed', () => {
    // Simulates the behavior: when no baseline exists, story goes to new_stories
    const output: CaptureOutput = {
      stories_checked: ['button--new'],
      passed: [],
      failed: [],
      new_stories: ['button--new'],
    }

    assert.equal(output.new_stories.length, 1)
    assert.equal(output.failed.length, 0)
    assert.ok(output.new_stories.includes('button--new'))
  })

  it('passes within-threshold diffs correctly', () => {
    // 5 changed pixels out of 10000 = 0.05% → below 0.1% threshold → pass
    const changedPixels = 5
    const totalPixels = 10000
    const threshold = 0.001 // 0.1%

    const passes = !isAboveThreshold(changedPixels, totalPixels, threshold)
    assert.ok(passes, 'Should pass when diff ratio is below threshold')

    const output: CaptureOutput = {
      stories_checked: ['button--primary'],
      passed: passes ? ['button--primary'] : [],
      failed: [],
      new_stories: [],
    }

    assert.equal(output.passed.length, 1)
    assert.equal(output.failed.length, 0)
  })

  it('fails above-threshold diffs correctly', () => {
    // 200 changed pixels out of 10000 = 2% → above 0.1% threshold → fail
    const changedPixels = 200
    const totalPixels = 10000
    const threshold = 0.001 // 0.1%

    const fails = isAboveThreshold(changedPixels, totalPixels, threshold)
    assert.ok(fails, 'Should fail when diff ratio exceeds threshold')
  })
})
